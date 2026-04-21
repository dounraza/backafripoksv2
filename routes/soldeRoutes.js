import express from 'express';
import { getSolde } from '../controllers/soldeController.js';
import { createDepot } from '../controllers/DepotMobileMoneyController.js';
import { createRetrait } from '../controllers/RetraitMobileMoneyController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getSolde);
router.post('/deposit', authenticateToken, createDepot);
router.post('/withdraw', authenticateToken, createRetrait);

export default router;
