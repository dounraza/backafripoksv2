import { Sequelize } from 'sequelize';
import 'dotenv/config';

console.log('Testing connection to:', process.env.DB_HOST, ':', process.env.DB_PORT);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'mysql',
    logging: console.log,
  }
);

async function test() {
  try {
    console.log('Attempting to authenticate...');
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
  }
}

test();
