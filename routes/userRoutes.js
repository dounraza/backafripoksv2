import express from 'express';
import { getUserProfile, updateChips } from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/profile', authenticateToken, getUserProfile);
router.post('/update-chips', authenticateToken, updateChips);

export default router;
