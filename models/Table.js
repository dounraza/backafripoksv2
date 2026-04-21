import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const TableModel = sequelize.define('Table', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  stakes: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 6,
  },
  gameState: {
    type: DataTypes.STRING,
    defaultValue: 'waiting',
  },
});

export default TableModel;
