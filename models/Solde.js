import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Solde = sequelize.define('Solde', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  montant: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
}, {
  tableName: 'solde',
  timestamps: false,
});

// Relation
User.hasOne(Solde, { foreignKey: 'userId' });
Solde.belongsTo(User, { foreignKey: 'userId' });

export default Solde;
