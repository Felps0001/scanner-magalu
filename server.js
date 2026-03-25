const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const selfsigned = require('selfsigned');

const app = express();
const PORT = 3000;
const HTTPS_PORT = 3443;
const updatesFilePath = path.join(__dirname, 'upDateUser.json');
const certDirectoryPath = path.join(__dirname, 'certs');
const certPath = path.join(certDirectoryPath, 'localhost-cert.pem');
const keyPath = path.join(certDirectoryPath, 'localhost-key.pem');
const scanQueue = [];

let isProcessingQueue = false;
let activeQueueItem = null;
let nextQueueItemId = 1;

app.use(express.json());

app.use(express.static(path.join(__dirname)));

function getLocalIPv4Addresses() {
  const networkInterfaces = os.networkInterfaces();

  return Object.values(networkInterfaces)
    .flat()
    .filter(details => details && details.family === 'IPv4' && !details.internal)
    .map(details => details.address)
    .filter((address, index, addresses) => addresses.indexOf(address) === index);
}

function buildCertificateAltNames() {
  const ipAddresses = ['127.0.0.1', ...getLocalIPv4Addresses()];
  const dnsNames = ['localhost', os.hostname()];

  return [
    ...dnsNames.map(value => ({ type: 2, value })),
    ...ipAddresses.map(value => ({ type: 7, ip: value }))
  ];
}

async function ensureHttpsCertificate() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8')
    };
  }

  fs.mkdirSync(certDirectoryPath, { recursive: true });

  const attributes = [{ name: 'commonName', value: 'scanner-magalu.local' }];
  const extensions = [
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: buildCertificateAltNames()
    }
  ];

  const certificate = await selfsigned.generate(attributes, {
    algorithm: 'sha256',
    days: 365,
    keySize: 2048,
    extensions
  });

  fs.writeFileSync(certPath, certificate.cert);
  fs.writeFileSync(keyPath, certificate.private);

  return {
    cert: certificate.cert,
    key: certificate.private
  };
}

function buildServerUrls(protocol, port) {
  const hosts = ['localhost', ...getLocalIPv4Addresses()];
  return hosts.map(host => `${protocol}://${host}:${port}`);
}

function readUpdatesFile() {
  try {
    const content = fs.readFileSync(updatesFilePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function writeUpdatesFile(data) {
  fs.writeFileSync(updatesFilePath, JSON.stringify(data, null, 2));
}

function getQueueSnapshot() {
  return {
    processing: Boolean(activeQueueItem),
    activeJobId: activeQueueItem ? activeQueueItem.id : null,
    waitingCount: scanQueue.length,
    totalInQueue: scanQueue.length + (activeQueueItem ? 1 : 0),
    updatedAt: new Date().toISOString()
  };
}

function buildScanPreview(user, rawValue) {
  const scannedUsers = readUpdatesFile();
  const existingEntry = scannedUsers.find(item => item._id === user._id) || null;
  const mergedEntry = existingEntry
    ? {
        ...user,
        ...existingEntry,
        rawValue: rawValue || existingEntry.rawValue
      }
    : {
        ...user,
        rawValue
      };

  const canWithdrawKit = mergedEntry.kit !== true;
  const canWithdrawExtra = mergedEntry.kit === true && mergedEntry.kitExtra === true && mergedEntry.kitExtraRetirada !== true;

  return {
    ok: true,
    entry: mergedEntry,
    canConfirm: canWithdrawKit || canWithdrawExtra,
    reason: canWithdrawKit
      ? 'kit-available'
      : canWithdrawExtra
        ? 'extra-kit-available'
        : 'kit-already-withdrawn'
  };
}

function processScanEntry(user, rawValue) {
  const scannedUsers = readUpdatesFile();
  const scannedAt = new Date().toISOString();
  const existingIndex = scannedUsers.findIndex(item => item._id === user._id);
  const existingEntry = existingIndex >= 0 ? scannedUsers[existingIndex] : null;
  const resolvedKit = (existingEntry && existingEntry.kit === true) || user.kit === true;
  const resolvedKitExtra = (existingEntry && existingEntry.kitExtra === true) || user.kitExtra === true;
  const resolvedKitExtraWithdrawn =
    (existingEntry && existingEntry.kitExtraRetirada === true) || user.kitExtraRetirada === true;

  function buildEntry(overrides = {}, scanCount = ((existingEntry && existingEntry.scanCount) || 0) + 1) {
    return {
      ...(existingEntry || {}),
      _id: user._id,
      nome: user.nome,
      id_magalu: user.id_magalu,
      cpf: user.cpf,
      regional: user.regional,
      filial: user.filial,
      cargo: user.cargo,
      kit: resolvedKit,
      kitExtra: resolvedKitExtra,
      kitExtraRetirada: resolvedKitExtraWithdrawn,
      rawValue,
      scannedAt,
      scanCount,
      ...overrides
    };
  }

  if (resolvedKit === true) {
    if (resolvedKitExtra === true && resolvedKitExtraWithdrawn === false) {
      const updatedEntry = buildEntry({ kitExtraRetirada: true });

      if (existingEntry) {
        scannedUsers[existingIndex] = updatedEntry;
      } else {
        scannedUsers.push(updatedEntry);
      }

      writeUpdatesFile(scannedUsers);
      return {
        ok: true,
        reason: 'extra-kit-withdrawn',
        entry: updatedEntry
      };
    }

    const normalizedEntry = buildEntry();

    if (existingEntry) {
      scannedUsers[existingIndex] = normalizedEntry;
      writeUpdatesFile(scannedUsers);
    }

    return {
      ok: false,
      statusCode: 409,
      reason: 'kit-already-withdrawn',
      entry: normalizedEntry
    };
  }

  const shouldWithdrawExtraNow = resolvedKitExtra === true && resolvedKitExtraWithdrawn === false;
  const entry = buildEntry({
    kit: true,
    kitExtraRetirada: shouldWithdrawExtraNow ? true : resolvedKitExtraWithdrawn
  });

  if (existingEntry) {
    scannedUsers[existingIndex] = {
      ...existingEntry,
      ...entry,
      scanCount: (existingEntry.scanCount || 0) + 1
    };
  } else {
    scannedUsers.push({
      ...entry,
      scanCount: 1
    });
  }

  writeUpdatesFile(scannedUsers);
  return {
    ok: true,
    reason: shouldWithdrawExtraNow ? 'kit-and-extra-withdrawn' : 'kit-withdrawn',
    entry
  };
}

async function processScanQueue() {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  while (scanQueue.length > 0) {
    const queueItem = scanQueue.shift();
    const startedAt = new Date().toISOString();

    activeQueueItem = {
      ...queueItem,
      startedAt
    };

    try {
      const result = processScanEntry(queueItem.user, queueItem.rawValue);
      const completedAt = new Date().toISOString();

      activeQueueItem = null;

      queueItem.resolve({
        ...result,
        queue: {
          jobId: queueItem.id,
          enqueuedAt: queueItem.enqueuedAt,
          startedAt,
          completedAt,
          ...getQueueSnapshot()
        }
      });
    } catch (error) {
      queueItem.reject(error);
    } finally {
      activeQueueItem = null;
    }
  }

  isProcessingQueue = false;
}

function enqueueScan(user, rawValue) {
  return new Promise((resolve, reject) => {
    scanQueue.push({
      id: nextQueueItemId++,
      user,
      rawValue,
      enqueuedAt: new Date().toISOString(),
      resolve,
      reject
    });

    void processScanQueue();
  });
}

app.get('/api/scans/queue-status', (req, res) => {
  res.json(getQueueSnapshot());
});

app.post('/api/scans/preview', (req, res) => {
  const { user, rawValue } = req.body ?? {};

  if (!user || !user._id) {
    return res.status(400).json({ error: 'Usuario invalido para consulta.' });
  }

  return res.json(buildScanPreview(user, rawValue));
});

app.post('/api/scans', async (req, res) => {
  const { user, rawValue } = req.body ?? {};

  if (!user || !user._id) {
    return res.status(400).json({ error: 'Usuario invalido para persistencia.' });
  }

  try {
    const result = await enqueueScan(user, rawValue);
    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Falha ao processar leitura na fila compartilhada.'
    });
  }
});

async function startServers() {
  const httpServer = http.createServer(app);
  const httpsOptions = await ensureHttpsCertificate();
  const httpsServer = https.createServer(httpsOptions, app);

  httpServer.listen(PORT, () => {
    console.log('Servidor HTTP ativo em:');

    for (const url of buildServerUrls('http', PORT)) {
      console.log(`- ${url}`);
    }
  });

  httpsServer.listen(HTTPS_PORT, () => {
    console.log('Servidor HTTPS ativo em:');

    for (const url of buildServerUrls('https', HTTPS_PORT)) {
      console.log(`- ${url}`);
    }

    console.log('Se o tablet mostrar alerta de certificado, aceite a excecao manualmente para liberar a camera.');
  });
}

startServers().catch(error => {
  console.error('Falha ao iniciar servidores HTTP/HTTPS:', error);
  process.exit(1);
});
