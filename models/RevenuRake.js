import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import HistoriqueMain from './HistoriqueMain.js';

const RevenuRake = sequelize.define('RevenuRake', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  montant: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  historiqueMainId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: HistoriqueMain,
      key: 'id'
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'revenu_rake',
  timestamps: true
});

// Relation
HistoriqueMain.hasOne(RevenuRake, { foreignKey: 'historiqueMainId' });
RevenuRake.belongsTo(HistoriqueMain, { foreignKey: 'historiqueMainId' });

export default RevenuRake;
