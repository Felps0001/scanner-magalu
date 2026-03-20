const connectMongo = require('./mongoConnect');
const mongoose = require('mongoose');
const fs = require('fs');

async function importUsers() {
  await connectMongo();

  const userSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', userSchema);

  const data = JSON.parse(fs.readFileSync('Users.json', 'utf8'));

  try {
    await User.insertMany(data);
    console.log('Importação concluída!');
  } catch (error) {
    console.error('Erro ao importar:', error);
  } finally {
    mongoose.disconnect();
  }
}

importUsers();
