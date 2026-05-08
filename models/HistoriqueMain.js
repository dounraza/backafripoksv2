import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const HistoriqueMain = sequelize.define('HistoriqueMain', {
  table_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  datetime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  cartes_communaute: {
    type: DataTypes.JSON,
    allowNull: true
  },
  main_joueurs: {
    type: DataTypes.JSON,
    allowNull: true
  },
  foldes: {
    type: DataTypes.JSON,
    allowNull: true
  },
  gagnants: {
    type: DataTypes.JSON,
    allowNull: true
  },
  rake: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'historique_main',
  timestamps: false
});

export default HistoriqueMain;
