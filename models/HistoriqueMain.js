import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const HistoriqueMain = sequelize.define('HistoriqueMain', {
  table_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cartes_communautema: {
    type: DataTypes.JSON, // Stocke ["7s","Qc","4h","6s","2c"]
    allowNull: true
  },
  in_joueurs: {
    type: DataTypes.JSON, // Stocke [{"pseudo":"...","cards":["..."]}]
    allowNull: false
  }
}, {
  tableName: 'historique_main',
  timestamps: true
});

export default HistoriqueMain;
