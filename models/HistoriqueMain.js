import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const HistoriqueMain = sequelize.define('HistoriqueMain', {
  table_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  cartes_communaute: { // Nom corrigé
    type: DataTypes.JSON, // Stocke ["7s","Qc","4h","6s","2c"]
    allowNull: true
  },
  main_joueurs: { // Colonne réintroduite selon l'exemple
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: '[]' // Ajout de la valeur par défaut pour éviter null
  },
  foldes: { // Colonne STRING (VARSTRING)
    type: DataTypes.STRING,
    allowNull: true
  },
  gagnants: { // Colonne STRING (VARSTRING)
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'historique_main',
  timestamps: false // Désactivation des timestamps
});

export default HistoriqueMain;
