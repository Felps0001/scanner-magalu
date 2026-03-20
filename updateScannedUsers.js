const fs = require('fs');

// Carrega Users.json
const users = JSON.parse(fs.readFileSync('Users.json', 'utf8'));

// Carrega lista de QRCodes escaneados
let scannedQRCodes = [];
try {
  scannedQRCodes = JSON.parse(fs.readFileSync('scannedQRCodes.json', 'utf8'));
} catch {
  // Se não existir, inicia vazio
}

// Atualiza campo kit para true
const updatedUsers = users.map(user => {
  if (scannedQRCodes.includes(user.qrcode)) {
    return { ...user, kit: true };
  }
  return user;
});

// Salva novo JSON
fs.writeFileSync('UsersUpdated.json', JSON.stringify(updatedUsers, null, 2));

console.log('Arquivo UsersUpdated.json gerado com sucesso!');
