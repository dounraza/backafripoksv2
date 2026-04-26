import express from 'express';
import { getUserProfile, updateUserProfile, updateChips, uploadAvatar, upload } from '../controllers/userController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/profile', authenticateToken, getUserProfile);
router.put('/profile', authenticateToken, upload, updateUserProfile);
router.post('/update-chips', authenticateToken, updateChips);
router.post('/upload-avatar', authenticateToken, uploadAvatar);

export default router;
