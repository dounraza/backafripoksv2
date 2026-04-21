import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TablePoker = sequelize.define('TablePoker', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  cave: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  smallBlind: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  bigBlind: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  gameType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'tablepoker',
  timestamps: false,
});

export default TablePoker;
