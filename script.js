const elements = {
  qrInput: document.getElementById('qrInput'),
  idMagaluInput: document.getElementById('idMagaluInput'),
  searchByIdBtn: document.getElementById('searchByIdBtn'),
  importUsersBtn: document.getElementById('importUsersBtn'),
  importUsersInput: document.getElementById('importUsersInput'),
  resetBtn: document.getElementById('resetBtn'),
  userName: document.getElementById('userName'),
  userMeta: document.getElementById('userMeta'),
  kitCard: document.getElementById('kitCard'),
  kitExtraCard: document.getElementById('kitExtraCard'),
  kitMsg: document.getElementById('kitMsg'),
  kitExtraMsg: document.getElementById('kitExtraMsg'),
  totalUsers: document.getElementById('totalUsers'),
  pendingKits: document.getElementById('pendingKits'),
  pendingExtraKits: document.getElementById('pendingExtraKits'),
  loadHint: document.getElementById('loadHint'),
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

let usersData = [];
let scanBuffer = '';
let usersDataReady = false;
let usersDataPromise;
let lastProcessedScan = '';
let scanBufferTimeout = null;
let pendingManualLookup = null;

function setLookupAvailability(isReady) {
  elements.idMagaluInput.disabled = !isReady;
  elements.searchByIdBtn.disabled = !isReady;
}

function setBaseStatus(text) {
  if (elements.baseStatusBadge) {
    elements.baseStatusBadge.textContent = text;
  }
}

function updateScannerDebug(rawValue) {
  const normalizedValue = rawValue || '';

  elements.qrInput.value = normalizedValue;
}

function clearScannerInputField() {
  elements.qrInput.value = '';
}

function applyUsersData(data, sourceLabel) {
  if (!Array.isArray(data)) {
    throw new Error('Formato invalido para Users.json');
  }

  usersData = data;
  usersDataReady = true;
  renderMetrics();
  setLookupAvailability(true);
  setBaseStatus(`Base carregada: ${sourceLabel}`);
  elements.loadHint.textContent = `${usersData.length} usuarios carregados da base atual.`;
}

function focusScannerField() {
  if (document.activeElement === elements.idMagaluInput) {
    return;
  }

  elements.qrInput.focus({ preventScroll: true });
}

function showLoadError() {
  usersDataReady = false;
  setLookupAvailability(false);
  setBaseStatus('Base nao carregada');
  elements.userName.textContent = 'Base nao carregada';
  elements.userMeta.textContent = 'Importe o Users.json ou execute node server.js antes de consultar.';
  setStatus(elements.kitMsg, 'Aguardando base', 'red');
  setStatus(elements.kitExtraMsg, 'Aguardando base', 'red');
  setStatusCard(elements.kitCard, 'red');
  setStatusCard(elements.kitExtraCard, 'red');
  elements.loadHint.textContent = 'Se a pagina foi aberta direto do arquivo, clique em Importar Users.json. Se estiver usando servidor local, execute node server.js e abra http://localhost:3000.';
}

async function loadUsersData() {
  setBaseStatus('Carregando base');

  try {
    const response = await fetch('Users.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Falha HTTP ${response.status}`);
    }

    const data = await response.json();
    applyUsersData(data, 'Users.json');
    return true;
  } catch {
    showLoadError();
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

function renderMetrics() {
  elements.totalUsers.textContent = String(usersData.length);
  elements.pendingKits.textContent = String(usersData.filter(user => user.kit === false).length);
  elements.pendingExtraKits.textContent = String(usersData.filter(user => user.kitExtra === true && user.kitExtraRetirada === false).length);
}

function setStatus(target, text, variant) {
  target.textContent = text;
  target.className = `status-pill ${variant}`;
}

function formatValue(value, fallback = '-') {
  return hasComparableValue(value) ? String(value).trim() : fallback;
}

function getKitStatusSummary(user) {
  return user.kit === false
    ? { text: 'Disponivel para retirada', variant: 'green' }
    : { text: 'Ja retirado', variant: 'red' };
}

function getKitExtraStatusSummary(user) {
  if (user.kitExtraRetirada === true) {
    return { text: 'Ja retirado', variant: 'red' };
  }

  if (user.kitExtra === true) {
    return { text: 'Disponivel para retirada', variant: 'green' };
  }

  return { text: 'Nao autorizado para retirada', variant: 'red' };
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
}

function openConfirmModal(user, rawValue) {
  pendingManualLookup = { user, rawValue };
  populateConfirmModal(user);
  elements.confirmModalOverlay.classList.remove('hidden');
  elements.confirmModalOverlay.setAttribute('aria-hidden', 'false');
  elements.confirmApproveBtn.focus();
}

function closeConfirmModal(options = {}) {
  const { resetPending = true, refocusManualInput = true } = options;

  elements.confirmModalOverlay.classList.add('hidden');
  elements.confirmModalOverlay.setAttribute('aria-hidden', 'true');

  if (resetPending) {
    pendingManualLookup = null;
  }

  if (refocusManualInput) {
    elements.idMagaluInput.focus();
    elements.idMagaluInput.select();
  }
}

function setStatusCard(target, variant) {
  target.className = `status-card ${variant}`;
}

function resetDashboard() {
  closeConfirmModal({ resetPending: true, refocusManualInput: false });
  elements.userName.textContent = 'Aguardando leitura';
  elements.userMeta.textContent = 'Nenhum QRCode lido.';
  setStatus(elements.kitMsg, 'Aguardando leitura', 'neutral');
  setStatus(elements.kitExtraMsg, 'Aguardando leitura', 'neutral');
  setStatusCard(elements.kitCard, 'neutral');
  setStatusCard(elements.kitExtraCard, 'neutral');
  elements.idMagaluInput.value = '';
  scanBuffer = '';
  lastProcessedScan = '';
  clearTimeout(scanBufferTimeout);
  updateScannerDebug('');
  focusScannerField();
}

function scheduleScanFlush(value, delay = 100) {
  scanBuffer = value;
  updateScannerDebug(scanBuffer);
  clearTimeout(scanBufferTimeout);
  scanBufferTimeout = setTimeout(() => {
    flushScannerValue(scanBuffer);
  }, delay);
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

function findUserByIdMagalu(idMagalu) {
  const normalizedId = idMagalu.trim();
  return usersData.find(user => String(user.id_magalu).trim() === normalizedId) || null;
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
    elements.userMeta.textContent = 'Leitura concluida, mas nao foi possivel salvar em upDateUser.json.';
    return null;
  }
}

function showStatus(user, scanResult = null) {
  if (!user) {
    elements.userName.textContent = 'Pessoa nao encontrada';
    elements.userMeta.textContent = 'Verifique se o QRCode pertence a base carregada.';
    setStatus(elements.kitMsg, 'Nao localizado', 'red');
    setStatus(elements.kitExtraMsg, 'Nao localizado', 'red');
    setStatusCard(elements.kitCard, 'red');
    setStatusCard(elements.kitExtraCard, 'red');
    return;
  }

  const effectiveUser = scanResult && scanResult.entry ? { ...user, ...scanResult.entry } : user;
  const kitWithdrawnNow = scanResult && (
    scanResult.reason === 'kit-withdrawn' ||
    scanResult.reason === 'kit-and-extra-withdrawn'
  );
  const extraWithdrawnNow = scanResult && (
    scanResult.reason === 'extra-kit-withdrawn' ||
    scanResult.reason === 'kit-and-extra-withdrawn'
  );

  elements.userName.textContent = effectiveUser.nome;
  elements.userMeta.textContent = `ID Magalu: ${effectiveUser.id_magalu} • Filial: ${effectiveUser.filial} • Regional: ${effectiveUser.regional}`;

  if (kitWithdrawnNow) {
    setStatus(elements.kitMsg, 'Retirada registrada', 'green');
    setStatusCard(elements.kitCard, 'green');
  } else if (effectiveUser.kit === false) {
    setStatus(elements.kitMsg, 'Disponivel para retirada', 'green');
    setStatusCard(elements.kitCard, 'green');
  } else {
    setStatus(elements.kitMsg, 'Ja retirado', 'red');
    setStatusCard(elements.kitCard, 'red');
  }

  if (extraWithdrawnNow) {
    setStatus(elements.kitExtraMsg, 'Retirada registrada', 'green');
    setStatusCard(elements.kitExtraCard, 'green');
  } else if (effectiveUser.kitExtraRetirada === true) {
    setStatus(elements.kitExtraMsg, 'Ja retirado', 'red');
    setStatusCard(elements.kitExtraCard, 'red');
  } else if (effectiveUser.kitExtra === true) {
    setStatus(elements.kitExtraMsg, 'Disponivel para retirada', 'green');
    setStatusCard(elements.kitExtraCard, 'green');
  } else {
    setStatus(elements.kitExtraMsg, 'Nao autorizado para retirada', 'red');
    setStatusCard(elements.kitExtraCard, 'red');
  }
}

async function processUserLookup(user, rawValue) {
  if (user) {
    const scanResult = await persistScan(user, rawValue);
    showStatus(user, scanResult);
    return;
  }

  showStatus(null);
}

async function processScannerInput(rawValue) {
  const ready = await ensureUsersLoaded();
  if (!ready) {
    clearScannerInputField();
    return;
  }

  const qrValue = rawValue.trim();

  if (!qrValue) {
    updateScannerDebug('');
    clearScannerInputField();
    return;
  }

  updateScannerDebug(qrValue);
  const user = findUserByScan(qrValue);
  await processUserLookup(user, qrValue);
  clearScannerInputField();
}

function requestManualLookupConfirmation(idMagalu) {
  const user = findUserByIdMagalu(idMagalu);

  if (!user) {
    showStatus(null);
    return false;
  }

  openConfirmModal(user, `manual:id_magalu:${idMagalu}`);
  return true;
}

async function flushScannerValue(rawValue) {
  const valueToProcess = (rawValue || '').trim();
  clearTimeout(scanBufferTimeout);

  if (!valueToProcess) {
    scanBuffer = '';
    updateScannerDebug('');
    clearScannerInputField();
    return;
  }

  if (valueToProcess === lastProcessedScan) {
    clearScannerInputField();
    return;
  }

  lastProcessedScan = valueToProcess;
  scanBuffer = '';
  await processScannerInput(valueToProcess);
}

elements.idMagaluInput.addEventListener('keydown', async event => {
  if (event.key !== 'Enter') {
    return;
  }

  const ready = await ensureUsersLoaded();
  if (!ready) {
    return;
  }

  const idMagalu = event.target.value.trim();

  if (!idMagalu) {
    return;
  }

  const opened = requestManualLookupConfirmation(idMagalu);
  if (opened) {
    return;
  }

  event.target.value = '';
});

elements.searchByIdBtn.addEventListener('click', async () => {
  const ready = await ensureUsersLoaded();
  if (!ready) {
    return;
  }

  const idMagalu = elements.idMagaluInput.value.trim();

  if (!idMagalu) {
    elements.idMagaluInput.focus();
    return;
  }

  const opened = requestManualLookupConfirmation(idMagalu);
  if (!opened) {
    elements.idMagaluInput.value = '';
    focusScannerField();
  }
});

elements.confirmModalCloseBtn.addEventListener('click', () => {
  closeConfirmModal();
});

elements.confirmCancelBtn.addEventListener('click', () => {
  closeConfirmModal();
});

elements.confirmApproveBtn.addEventListener('click', async () => {
  if (!pendingManualLookup) {
    closeConfirmModal();
    return;
  }

  const { user, rawValue } = pendingManualLookup;
  closeConfirmModal({ resetPending: false, refocusManualInput: false });
  await processUserLookup(user, rawValue);
  pendingManualLookup = null;
  elements.idMagaluInput.value = '';
  focusScannerField();
});

elements.confirmModalOverlay.addEventListener('click', event => {
  if (event.target === elements.confirmModalOverlay) {
    closeConfirmModal();
  }
});

elements.qrInput.addEventListener('focus', () => {
  updateScannerDebug(elements.qrInput.value);
});

elements.qrInput.addEventListener('paste', async event => {
  const pastedText = event.clipboardData ? event.clipboardData.getData('text') : '';

  if (!pastedText) {
    return;
  }

  event.preventDefault();
  clearTimeout(scanBufferTimeout);
  await flushScannerValue(pastedText);
});

document.addEventListener('keydown', async event => {
  if (!elements.confirmModalOverlay.classList.contains('hidden')) {
    if (event.key === 'Escape') {
      closeConfirmModal();
      return;
    }

    if (event.key === 'Enter' && event.target !== elements.idMagaluInput) {
      event.preventDefault();
      elements.confirmApproveBtn.click();
    }

    return;
  }

  if (event.target === elements.idMagaluInput) {
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(scanBufferTimeout);
    await flushScannerValue(scanBuffer);
    return;
  }

  if (event.key === 'Backspace') {
    scanBuffer = scanBuffer.slice(0, -1);
    updateScannerDebug(scanBuffer);
    return;
  }

  if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  scanBuffer += event.key;
  scheduleScanFlush(scanBuffer);
});

elements.importUsersBtn.addEventListener('click', () => {
  elements.importUsersInput.click();
});

elements.importUsersInput.addEventListener('change', async event => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const data = JSON.parse(content);
    applyUsersData(data, file.name);
    resetDashboard();
  } catch {
    showLoadError();
    elements.userMeta.textContent = 'O arquivo selecionado nao e um JSON valido da base de usuarios.';
  } finally {
    event.target.value = '';
  }
});

elements.resetBtn.addEventListener('click', resetDashboard);

setLookupAvailability(false);
resetDashboard();
usersDataPromise = loadUsersData();
window.addEventListener('load', focusScannerField);
