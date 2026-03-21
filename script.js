const elements = {
  qrInput: document.getElementById('qrInput'),
  idMagaluInput: document.getElementById('idMagaluInput'),
  searchByIdBtn: document.getElementById('searchByIdBtn'),
  resetBtn: document.getElementById('resetBtn'),
  userName: document.getElementById('userName'),
  userMeta: document.getElementById('userMeta'),
  kitCard: document.getElementById('kitCard'),
  kitExtraCard: document.getElementById('kitExtraCard'),
  kitMsg: document.getElementById('kitMsg'),
  kitExtraMsg: document.getElementById('kitExtraMsg'),
  totalUsers: document.getElementById('totalUsers'),
  pendingKits: document.getElementById('pendingKits'),
  pendingExtraKits: document.getElementById('pendingExtraKits')
};

let usersData = [];
let scanBuffer = '';

fetch('Users.json')
  .then(response => response.json())
  .then(data => {
    usersData = data;
    renderMetrics();
  })
  .catch(() => {
    elements.userName.textContent = 'Erro ao carregar base';
    elements.userMeta.textContent = 'Nao foi possivel abrir o arquivo Users.json.';
    setStatus(elements.kitMsg, 'Erro na leitura', 'red');
    setStatus(elements.kitExtraMsg, 'Erro na leitura', 'red');
  });

function renderMetrics() {
  elements.totalUsers.textContent = String(usersData.length);
  elements.pendingKits.textContent = String(usersData.filter(user => user.kit === false).length);
  elements.pendingExtraKits.textContent = String(usersData.filter(user => user.kitExtra === true && user.kitExtraRetirada === false).length);
}

function setStatus(target, text, variant) {
  target.textContent = text;
  target.className = `status-pill ${variant}`;
}

function setStatusCard(target, variant) {
  target.className = `status-card ${variant}`;
}

function resetDashboard() {
  elements.userName.textContent = 'Aguardando leitura';
  elements.userMeta.textContent = 'Nenhum QRCode lido.';
  setStatus(elements.kitMsg, 'Aguardando leitura', 'neutral');
  setStatus(elements.kitExtraMsg, 'Aguardando leitura', 'neutral');
  setStatusCard(elements.kitCard, 'neutral');
  setStatusCard(elements.kitExtraCard, 'neutral');
  elements.qrInput.value = '';
  elements.idMagaluInput.value = '';
  scanBuffer = '';
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

async function persistScan(user, rawValue) {
  try {
    const response = await fetch('/api/scans', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user, rawValue })
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
  const qrValue = rawValue.trim();

  if (!qrValue) {
    elements.qrInput.value = '';
    return;
  }

  elements.qrInput.value = qrValue;
  const user = findUserByScan(qrValue);
  await processUserLookup(user, qrValue);
}

elements.idMagaluInput.addEventListener('keydown', async event => {
  if (event.key !== 'Enter') {
    return;
  }

  const idMagalu = event.target.value.trim();

  if (!idMagalu) {
    return;
  }

  const user = findUserByIdMagalu(idMagalu);
  await processUserLookup(user, `manual:id_magalu:${idMagalu}`);
  event.target.value = '';
});

elements.searchByIdBtn.addEventListener('click', async () => {
  const idMagalu = elements.idMagaluInput.value.trim();

  if (!idMagalu) {
    elements.idMagaluInput.focus();
    return;
  }

  const user = findUserByIdMagalu(idMagalu);
  await processUserLookup(user, `manual:id_magalu:${idMagalu}`);
  elements.idMagaluInput.value = '';
});

document.addEventListener('keydown', async event => {
  if (event.target === elements.idMagaluInput) {
    return;
  }

  if (event.key === 'Enter') {
    const valueToProcess = scanBuffer;
    scanBuffer = '';
    await processScannerInput(valueToProcess);
    return;
  }

  if (event.key === 'Backspace') {
    scanBuffer = scanBuffer.slice(0, -1);
    elements.qrInput.value = scanBuffer;
    return;
  }

  if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }

  scanBuffer += event.key;
  elements.qrInput.value = scanBuffer;
});

elements.resetBtn.addEventListener('click', resetDashboard);

resetDashboard();
