import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

import bcrypt from 'bcryptjs';

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Hachage du mot de passe avant création
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = await User.create({ 
      name, 
      email, 
      password: hashedPassword 
    });
    
    res.status(201).json({ message: 'User created' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    
    if (user && (await user.validPassword(password))) {
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        token: token
      });
    } else {
      res.status(401).json({ error: 'Invalid Email or password' });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
