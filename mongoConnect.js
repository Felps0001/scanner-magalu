require('dotenv').config();
const mongoose = require('mongoose');

const user = process.env.MONGODB_USER;
const password = process.env.MONGODB_PASSWORD;
const cluster = process.env.MONGODB_CLUSTER;
const options = process.env.MONGODB_OPTIONS;
const dbName = process.env.MONGODB_DB_NAME;

const uri = `mongodb+srv://${user}:${password}@${cluster}/${dbName}${options}`;

async function connectMongo() {
  try {
    await mongoose.connect(uri);
    console.log('MongoDB Atlas conectado com sucesso!');
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB Atlas:', error);
    process.exit(1);
  }
}

module.exports = connectMongo;
