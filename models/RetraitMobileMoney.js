import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const RetraitMobileMoney = sequelize.define('RetraitMobileMoney', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  pseudo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  montant: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  numero: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  etat: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'retrait_mobile_money',
  timestamps: true,
});

export default RetraitMobileMoney;
