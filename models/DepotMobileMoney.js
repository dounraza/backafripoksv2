import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const DepotMobileMoney = sequelize.define('DepotMobileMoney', {
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
  reference: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  etat: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'depot_mobile_money',
  timestamps: true, // reference had CreatedAt/UpdatedAt
});

export default DepotMobileMoney;
