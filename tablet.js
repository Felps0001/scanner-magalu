const elements = {
  baseStatus: document.getElementById('baseStatus'),
  cameraStatus: document.getElementById('cameraStatus'),
  tabletHint: document.getElementById('tabletHint'),
  startScannerBtn: document.getElementById('startScannerBtn'),
  stopScannerBtn: document.getElementById('stopScannerBtn'),
  resultSection: document.getElementById('resultSection'),
  resultAnchorLink: document.getElementById('resultAnchorLink'),
  cameraSelect: document.getElementById('cameraSelect'),
  imageScannerInput: document.getElementById('imageScannerInput'),
  resultBanner: document.getElementById('resultBanner'),
  resultTitle: document.getElementById('resultTitle'),
  resultMeta: document.getElementById('resultMeta'),
  kitCard: document.getElementById('kitCard'),
  kitExtraCard: document.getElementById('kitExtraCard'),
  kitMsg: document.getElementById('kitMsg'),
  kitExtraMsg: document.getElementById('kitExtraMsg'),
  scanFootnote: document.getElementById('scanFootnote'),
  confirmModalOverlay: document.getElementById('confirmModalOverlay'),
  confirmModalCloseBtn: document.getElementById('confirmModalCloseBtn'),
  confirmCancelBtn: document.getElementById('confirmCancelBtn'),
  confirmApproveBtn: document.getElementById('confirmApproveBtn'),
  confirmUserName: document.getElementById('confirmUserName'),
  confirmUserMeta: document.getElementById('confirmUserMeta'),
  confirmUserIdMagalu: document.getElementById('confirmUserIdMagalu'),
  confirmUserCpf: document.getElementById('confirmUserCpf'),
  confirmUserFilial: document.getElementById('confirmUserFilial'),
  confirmUserRegional: document.getElementById('confirmUserRegional'),
  confirmUserCargo: document.getElementById('confirmUserCargo'),
  confirmKitStatus: document.getElementById('confirmKitStatus'),
  confirmKitExtraStatus: document.getElementById('confirmKitExtraStatus')
};

const scanCooldownMs = 2500;

let usersData = [];
let usersDataReady = false;
let usersDataPromise = null;
let html5QrCode = null;
let isScannerRunning = false;
let isProcessingScan = false;
let availableCameras = [];
let activeCameraId = '';
let lastScanValue = '';
let lastScanAt = 0;
let pendingScanConfirmation = null;

function mergeUserIntoLocalData(user) {
  const userIndex = usersData.findIndex(item => item._id === user._id);

  if (userIndex >= 0) {
    usersData[userIndex] = {
      ...usersData[userIndex],
      ...user
    };
  }
}

function setBaseStatus(text, variant = 'default') {
  elements.baseStatus.textContent = text;
  elements.baseStatus.dataset.variant = variant;
}

function setCameraStatus(text) {
  elements.cameraStatus.textContent = text;
}

function setHint(text) {
  elements.tabletHint.textContent = text;
}

function setStatus(target, text, variant) {
  target.textContent = text;
  target.className = `tablet-status-pill ${variant}`;
}

function setStatusCard(target, variant) {
  target.className = `tablet-status-card ${variant}`;
}

function setResultBanner(variant, title, meta) {
  elements.resultBanner.className = `result-banner ${variant}`;
  elements.resultTitle.textContent = title;
  elements.resultMeta.textContent = meta;
}

function scrollToResult() {
  if (!elements.resultSection) {
    return;
  }

  elements.resultSection.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function formatValue(value, fallback = '-') {
  return hasComparableValue(value) ? String(value).trim() : fallback;
}

function resetResultState() {
  setResultBanner('neutral', 'Aguardando leitura', 'Nenhum QRCode foi lido ainda.');
  setStatus(elements.kitMsg, 'Aguardando leitura', 'neutral');
  setStatus(elements.kitExtraMsg, 'Aguardando leitura', 'neutral');
  setStatusCard(elements.kitCard, 'neutral');
  setStatusCard(elements.kitExtraCard, 'neutral');
  elements.scanFootnote.textContent = 'A câmera pode continuar aberta para a próxima leitura.';
}

function populateConfirmModal(user) {
  elements.confirmUserName.textContent = user.nome;
  elements.confirmUserMeta.textContent = `${formatValue(user.cargo)} • Filial ${formatValue(user.filial)} • Regional ${formatValue(user.regional)}`;
  elements.confirmUserIdMagalu.textContent = formatValue(user.id_magalu);
  elements.confirmUserCpf.textContent = formatValue(user.cpf);
  elements.confirmUserFilial.textContent = formatValue(user.filial);
  elements.confirmUserRegional.textContent = formatValue(user.regional);
  elements.confirmUserCargo.textContent = formatValue(user.cargo);

  const kitStatus = getKitStatusSummary(user);
  const extraStatus = getKitExtraStatusSummary(user);
  setStatus(elements.confirmKitStatus, kitStatus.text, kitStatus.variant);
  setStatus(elements.confirmKitExtraStatus, extraStatus.text, extraStatus.variant);

  const canConfirmWithdrawal = user.kit !== true || (user.kit === true && user.kitExtra === true && user.kitExtraRetirada !== true);
  elements.confirmApproveBtn.disabled = !canConfirmWithdrawal;
  elements.confirmApproveBtn.textContent = user.kit === true && user.kitExtra === true && user.kitExtraRetirada !== true
    ? 'Confirmar retirada extra'
    : 'Confirmar baixa';
}

function openConfirmModal(user, rawValue) {
  pendingScanConfirmation = { user, rawValue };
  populateConfirmModal(user);
  elements.confirmModalOverlay.classList.remove('hidden');
  elements.confirmModalOverlay.setAttribute('aria-hidden', 'false');
  elements.confirmApproveBtn.focus();
}

function closeConfirmModal(options = {}) {
  const { resetPending = true } = options;

  elements.confirmModalOverlay.classList.add('hidden');
  elements.confirmModalOverlay.setAttribute('aria-hidden', 'true');

  if (resetPending) {
    pendingScanConfirmation = null;
  }
}

function hasComparableValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function valuesMatch(left, right) {
  if (!hasComparableValue(left) || !hasComparableValue(right)) {
    return false;
  }

  return String(left).trim() === String(right).trim();
}

function getUserPayload(user) {
  if (!user.qrCodePayload) {
    return null;
  }

  try {
    const payload = JSON.parse(user.qrCodePayload);
    return payload && payload.user ? payload.user : null;
  } catch {
    return null;
  }
}

function tryParseStructuredPayload(value) {
  const candidates = [value];

  if (value.includes('\\"')) {
    candidates.push(value.replace(/\\"/g, '"'));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (typeof parsed === 'string') {
        try {
          const reparsed = JSON.parse(parsed);
          if (reparsed && reparsed.user && reparsed.user.userId) {
            return reparsed;
          }
        } catch {}
      }

      if (parsed && parsed.user && parsed.user.userId) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

function parseScannedValue(rawValue) {
  const trimmedValue = rawValue.trim();
  const parsed = tryParseStructuredPayload(trimmedValue);

  if (parsed) {
    return {
      rawValue: trimmedValue,
      userId: parsed.user.userId,
      idMagalu: parsed.user.id_magalu,
      cpf: parsed.user.cpf,
      isStructuredPayload: true
    };
  }

  return {
    rawValue: trimmedValue,
    userId: trimmedValue,
    idMagalu: trimmedValue,
    cpf: trimmedValue,
    isStructuredPayload: false
  };
}

function matchesStrongIdentifiers(user, scanData) {
  if (valuesMatch(user._id, scanData.userId) || valuesMatch(user.id_magalu, scanData.idMagalu)) {
    return true;
  }

  const payloadUser = getUserPayload(user);
  if (!payloadUser) {
    return false;
  }

  return valuesMatch(payloadUser.userId, scanData.userId) || valuesMatch(payloadUser.id_magalu, scanData.idMagalu);
}

function matchesCpf(user, scanData) {
  if (valuesMatch(user.cpf, scanData.cpf)) {
    return true;
  }

  const payloadUser = getUserPayload(user);
  return payloadUser ? valuesMatch(payloadUser.cpf, scanData.cpf) : false;
}

function findUserByScan(rawValue) {
  const scanData = parseScannedValue(rawValue);
  const strongMatch = usersData.find(user => matchesStrongIdentifiers(user, scanData));

  if (strongMatch) {
    return strongMatch;
  }

  const hasStrongIdentifiers = hasComparableValue(scanData.userId) || hasComparableValue(scanData.idMagalu);
  if (scanData.isStructuredPayload && hasStrongIdentifiers) {
    return null;
  }

  return usersData.find(user => matchesCpf(user, scanData)) || null;
}

function buildPersistUserPayload(user) {
  return {
    _id: user._id,
    nome: user.nome,
    id_magalu: user.id_magalu,
    cpf: user.cpf,
    regional: user.regional,
    filial: user.filial,
    cargo: user.cargo,
    kit: user.kit,
    kitExtra: user.kitExtra,
    kitExtraRetirada: user.kitExtraRetirada
  };
}

function pulse(duration = 120) {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}

function getKitStatusSummary(user, scanResult) {
  if (scanResult && (scanResult.reason === 'kit-withdrawn' || scanResult.reason === 'kit-and-extra-withdrawn')) {
    return { text: 'Retirada registrada', variant: 'green' };
  }

  if (user.kit === false) {
    return { text: 'Disponivel para retirada', variant: 'green' };
  }

  return { text: 'Ja retirado', variant: 'red' };
}

function getKitExtraStatusSummary(user, scanResult) {
  if (scanResult && (scanResult.reason === 'extra-kit-withdrawn' || scanResult.reason === 'kit-and-extra-withdrawn')) {
    return { text: 'Retirada registrada', variant: 'green' };
  }

  if (user.kitExtraRetirada === true) {
    return { text: 'Ja retirado', variant: 'red' };
  }

  if (user.kitExtra === true) {
    return { text: 'Disponivel para retirada', variant: 'green' };
  }

  return { text: 'Nao autorizado', variant: 'red' };
}

function showNotFound(rawValue) {
  setResultBanner('danger', 'Pessoa nao encontrada', 'Verifique se o QRCode pertence a base atual.');
  setStatus(elements.kitMsg, 'Nao localizado', 'red');
  setStatus(elements.kitExtraMsg, 'Nao localizado', 'red');
  setStatusCard(elements.kitCard, 'red');
  setStatusCard(elements.kitExtraCard, 'red');
  elements.scanFootnote.textContent = `Leitura recebida: ${rawValue}`;
  setCameraStatus('QRCode lido, mas sem correspondencia na base.');
  scrollToResult();
  pulse(260);
}

function showPersistError(user) {
  setResultBanner('danger', user.nome, 'Leitura identificada, mas nao foi possivel salvar a baixa.');
  setStatus(elements.kitMsg, 'Falha ao salvar', 'red');
  setStatus(elements.kitExtraMsg, 'Falha ao salvar', 'red');
  setStatusCard(elements.kitCard, 'red');
  setStatusCard(elements.kitExtraCard, 'red');
  elements.scanFootnote.textContent = 'Confirme a conexao com o servidor antes de continuar.';
  setCameraStatus('Falha ao persistir a leitura.');
  scrollToResult();
  pulse(260);
}

function showResult(user, scanResult) {
  const effectiveUser = scanResult && scanResult.entry ? { ...user, ...scanResult.entry } : user;
  const kitStatus = getKitStatusSummary(effectiveUser, scanResult);
  const kitExtraStatus = getKitExtraStatusSummary(effectiveUser, scanResult);
  const isSuccess = scanResult && scanResult.ok !== false;
  const bannerVariant = isSuccess ? 'success' : 'danger';
  const bannerMeta = `ID Magalu ${effectiveUser.id_magalu} • Filial ${effectiveUser.filial || '-'} • Regional ${effectiveUser.regional || '-'} • ${effectiveUser.cargo || '-'}`;

  setResultBanner(bannerVariant, effectiveUser.nome, bannerMeta);
  setStatus(elements.kitMsg, kitStatus.text, kitStatus.variant);
  setStatus(elements.kitExtraMsg, kitExtraStatus.text, kitExtraStatus.variant);
  setStatusCard(elements.kitCard, kitStatus.variant);
  setStatusCard(elements.kitExtraCard, kitExtraStatus.variant);
  scrollToResult();

  if (scanResult && scanResult.reason === 'kit-already-withdrawn') {
    elements.scanFootnote.textContent = 'Essa pessoa ja tinha retirada registrada anteriormente.';
    setCameraStatus('Leitura concluida: kit ja retirado.');
    pulse(260);
    return;
  }

  elements.scanFootnote.textContent = `Ultima baixa em ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`;
  setCameraStatus('Baixa registrada. Pode apontar para o proximo QRCode.');
  pulse(90);
}

async function persistScan(user, rawValue) {
  try {
    const response = await fetch('/api/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user: buildPersistUserPayload(user), rawValue })
    });

    return await response.json();
  } catch {
    return null;
  }
}

async function fetchScanPreview(user, rawValue) {
  try {
    const response = await fetch('/api/scans/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user: buildPersistUserPayload(user), rawValue })
    });

    return await response.json();
  } catch {
    return null;
  }
}

function updateCameraControls() {
  elements.startScannerBtn.disabled = isScannerRunning;
  elements.stopScannerBtn.disabled = !isScannerRunning;
  elements.cameraSelect.disabled = availableCameras.length === 0;
}

function fillCameraSelect() {
  const options = availableCameras.map(camera => {
    const selected = camera.id === activeCameraId ? ' selected' : '';
    return `<option value="${camera.id}"${selected}>${camera.label || 'Camera traseira'}</option>`;
  });

  elements.cameraSelect.innerHTML = options.join('') || '<option value="">Nenhuma camera encontrada</option>';
}

async function loadUsersData() {
  setBaseStatus('Carregando base');

  try {
    const response = await fetch('Users.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    usersData = await response.json();
    usersDataReady = true;
    setBaseStatus(`Base pronta: ${usersData.length} registros`, 'ready');
    setHint('Base carregada. Agora basta abrir a câmera e escanear.');
    return true;
  } catch {
    usersDataReady = false;
    setBaseStatus('Base indisponivel', 'error');
    setHint('Nao foi possivel carregar Users.json. Abra a pagina via node server.js ou importe a base na tela principal.');
    return false;
  }
}

async function ensureUsersLoaded() {
  if (usersDataReady) {
    return true;
  }

  if (usersDataPromise) {
    await usersDataPromise;
  }

  return usersDataReady;
}

function isDuplicateScan(rawValue) {
  const now = Date.now();

  if (rawValue === lastScanValue && now - lastScanAt < scanCooldownMs) {
    return true;
  }

  lastScanValue = rawValue;
  lastScanAt = now;
  return false;
}

async function processScannedValue(rawValue) {
  const normalizedValue = (rawValue || '').trim();

  if (!normalizedValue || isProcessingScan || pendingScanConfirmation || isDuplicateScan(normalizedValue)) {
    return;
  }

  const ready = await ensureUsersLoaded();
  if (!ready) {
    setCameraStatus('A base de usuarios nao foi carregada.');
    return;
  }

  isProcessingScan = true;
  setCameraStatus('QRCode detectado. Validando cadastro...');

  try {
    const user = findUserByScan(normalizedValue);

    if (!user) {
      showNotFound(normalizedValue);
      return;
    }

    const preview = await fetchScanPreview(user, normalizedValue);
    const effectiveUser = preview && preview.entry ? preview.entry : user;

    mergeUserIntoLocalData(effectiveUser);

    if (preview && preview.canConfirm === false) {
      showResult(effectiveUser, {
        ok: false,
        reason: 'kit-already-withdrawn',
        entry: effectiveUser
      });
      setCameraStatus('Essa retirada ja consta no sistema.');
      pulse(260);
      return;
    }

    openConfirmModal(effectiveUser, normalizedValue);
    setCameraStatus('QRCode identificado. Confirme a retirada no modal.');
    pulse(80);
  } finally {
    isProcessingScan = false;
  }
}

async function ensureScannerInstance() {
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('reader');
  }

  return html5QrCode;
}

async function ensureCamerasLoaded() {
  if (availableCameras.length > 0) {
    return availableCameras;
  }

  const cameras = await Html5Qrcode.getCameras();
  availableCameras = cameras;

  if (!activeCameraId && cameras.length > 0) {
    const preferredBackCamera = cameras.find(camera => /back|traseira|environment|rear/i.test(camera.label));
    activeCameraId = preferredBackCamera ? preferredBackCamera.id : cameras[0].id;
  }

  fillCameraSelect();
  updateCameraControls();
  return availableCameras;
}

async function stopScanner() {
  if (!html5QrCode || !isScannerRunning) {
    isScannerRunning = false;
    updateCameraControls();
    return;
  }

  await html5QrCode.stop();
  await html5QrCode.clear();
  isScannerRunning = false;
  setCameraStatus('Camera parada. Toque em Abrir câmera para retomar.');
  updateCameraControls();
}

async function startScanner(cameraId = activeCameraId) {
  const ready = await ensureUsersLoaded();
  if (!ready) {
    setCameraStatus('Nao foi possivel iniciar porque a base ainda nao carregou.');
    return;
  }

  try {
    await ensureScannerInstance();
    await ensureCamerasLoaded();

    if (!cameraId) {
      setCameraStatus('Nenhuma camera encontrada neste tablet.');
      return;
    }

    if (isScannerRunning) {
      await stopScanner();
    }

    activeCameraId = cameraId;
    fillCameraSelect();

    await html5QrCode.start(
      { deviceId: { exact: cameraId } },
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1,
        rememberLastUsedCamera: true
      },
      decodedText => {
        void processScannedValue(decodedText);
      },
      () => {}
    );

    isScannerRunning = true;
    setCameraStatus('Camera ativa. Aponte para o QRCode.');
    setHint('Leitura continua habilitada. A baixa acontece automaticamente apos detectar o QRCode.');
  } catch (error) {
    isScannerRunning = false;
    setCameraStatus('Nao foi possivel abrir a camera do tablet.');
    setHint('Verifique a permissao de camera no navegador. Se precisar, use a opcao Ler por foto.');
  } finally {
    updateCameraControls();
  }
}

async function handleImageScan(event) {
  const [file] = event.target.files || [];
  event.target.value = '';

  if (!file) {
    return;
  }

  try {
    await ensureScannerInstance();
    const decodedText = await html5QrCode.scanFile(file, true);
    await processScannedValue(decodedText);
  } catch {
    setCameraStatus('Nao foi possivel ler o QRCode pela foto selecionada.');
    pulse(260);
  }
}

elements.startScannerBtn.addEventListener('click', () => {
  void startScanner(elements.cameraSelect.value || activeCameraId);
});

elements.stopScannerBtn.addEventListener('click', () => {
  void stopScanner();
});

elements.cameraSelect.addEventListener('change', event => {
  activeCameraId = event.target.value;

  if (isScannerRunning) {
    void startScanner(activeCameraId);
  }
});

elements.imageScannerInput.addEventListener('change', event => {
  void handleImageScan(event);
});

elements.resultAnchorLink.addEventListener('click', event => {
  event.preventDefault();
  scrollToResult();
});

elements.confirmModalCloseBtn.addEventListener('click', () => {
  closeConfirmModal();
  setCameraStatus('Confirmacao cancelada. Aponte para outro QRCode ou escaneie novamente.');
});

elements.confirmCancelBtn.addEventListener('click', () => {
  closeConfirmModal();
  setCameraStatus('Confirmacao cancelada. Aponte para outro QRCode ou escaneie novamente.');
});

elements.confirmApproveBtn.addEventListener('click', async () => {
  if (!pendingScanConfirmation || isProcessingScan) {
    return;
  }

  const { user, rawValue } = pendingScanConfirmation;
  isProcessingScan = true;
  closeConfirmModal({ resetPending: false });
  setCameraStatus('Registrando baixa...');

  try {
    const scanResult = await persistScan(user, rawValue);

    if (!scanResult) {
      showPersistError(user);
      return;
    }

    if (scanResult.entry) {
      mergeUserIntoLocalData(scanResult.entry);
    }

    showResult(user, scanResult);
  } finally {
    pendingScanConfirmation = null;
    isProcessingScan = false;
  }
});

elements.confirmModalOverlay.addEventListener('click', event => {
  if (event.target === elements.confirmModalOverlay) {
    closeConfirmModal();
    setCameraStatus('Confirmacao cancelada. Aponte para outro QRCode ou escaneie novamente.');
  }
});

document.addEventListener('keydown', event => {
  if (elements.confirmModalOverlay.classList.contains('hidden')) {
    return;
  }

  if (event.key === 'Escape') {
    closeConfirmModal();
    setCameraStatus('Confirmacao cancelada. Aponte para outro QRCode ou escaneie novamente.');
  }
});

window.addEventListener('beforeunload', () => {
  if (html5QrCode && isScannerRunning) {
    void html5QrCode.stop();
  }
});

closeConfirmModal();
resetResultState();
updateCameraControls();
usersDataPromise = loadUsersData();