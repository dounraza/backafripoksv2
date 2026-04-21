import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import bcrypt from 'bcryptjs';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  chips: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 1000.00,
  },
}, {
  tableName: 'users',
  timestamps: false,
});

User.prototype.validPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

export default User;
