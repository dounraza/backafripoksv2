import { Sequelize } from 'sequelize';
import 'dotenv/config';

if (!process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  throw new Error('Database configuration variables are missing.');
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: false,
    dialectOptions: {
      connectTimeout: 60000 // 60 seconds
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 60000,
      idle: 10000,
      evict: 1000
    }
  }
);

export const connectDB = async (retries = 5) => {
  while (retries > 0) {
    try {
      await sequelize.authenticate();
      console.log('Successfully connected to MySQL database.');
      return;
    } catch (error) {
      console.error(`Unable to connect to the database (${retries} retries left):`, error.message);
      retries -= 1;
      if (retries === 0) {
        console.error('Max retries reached. Exiting...');
        process.exit(1);
      }
      console.log('Retrying in 5 seconds...');
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

export default sequelize;
