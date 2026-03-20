const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const updatesFilePath = path.join(__dirname, 'upDateUser.json');

app.use(express.json());

app.use(express.static(path.join(__dirname)));

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

app.post('/api/scans', (req, res) => {
  const { user, rawValue } = req.body ?? {};

  if (!user || !user._id) {
    return res.status(400).json({ error: 'Usuario invalido para persistencia.' });
  }

  const scannedUsers = readUpdatesFile();
  const scannedAt = new Date().toISOString();
  const existingIndex = scannedUsers.findIndex(item => item._id === user._id);
  const existingEntry = existingIndex >= 0 ? scannedUsers[existingIndex] : null;
  const shouldMarkExtraWithdrawn = user.kitExtra === true || (existingEntry && existingEntry.kitExtra === true);

  if (user.kit === true || (existingEntry && existingEntry.kit === true)) {
    const normalizedEntry = {
      ...(existingEntry || {}),
      _id: user._id,
      nome: user.nome,
      id_magalu: user.id_magalu,
      cpf: user.cpf,
      regional: user.regional,
      filial: user.filial,
      cargo: user.cargo,
      kit: true,
      kitExtra: user.kitExtra,
      kitExtraRetirada: shouldMarkExtraWithdrawn ? true : user.kitExtraRetirada,
      rawValue,
      scannedAt,
      scanCount: ((existingEntry && existingEntry.scanCount) || 0) + 1
    };

    if (existingEntry) {
      scannedUsers[existingIndex] = normalizedEntry;
      writeUpdatesFile(scannedUsers);
    }

    return res.status(409).json({
      ok: false,
      reason: 'kit-already-withdrawn',
      entry: normalizedEntry
    });
  }

  const entry = {
    _id: user._id,
    nome: user.nome,
    id_magalu: user.id_magalu,
    cpf: user.cpf,
    regional: user.regional,
    filial: user.filial,
    cargo: user.cargo,
    kit: true,
    kitExtra: user.kitExtra,
    kitExtraRetirada: shouldMarkExtraWithdrawn ? true : user.kitExtraRetirada,
    rawValue,
    scannedAt
  };

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
  return res.json({ ok: true, reason: 'kit-withdrawn', entry });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
