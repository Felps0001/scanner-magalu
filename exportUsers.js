const connectMongo = require('./mongoConnect');
const mongoose = require('mongoose');
const fs = require('fs');

async function exportUsers() {
  await connectMongo();

  const userSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', userSchema);

  try {
    const users = await User.find({});
    fs.writeFileSync('Users.json', JSON.stringify(users, null, 2));
    console.log('Exportação concluída!');
  } catch (error) {
    console.error('Erro ao exportar:', error);
  } finally {
    mongoose.disconnect();
  }
}

exportUsers();
