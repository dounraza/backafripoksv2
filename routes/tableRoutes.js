import express from 'express';
import { getTables, getHistorique, getHistoriqueByTableId } from '../controllers/tableController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getTables);
router.get('/historique/:tableName', authenticateToken, getHistorique);
router.get('/:id/historique', authenticateToken, getHistoriqueByTableId);

export default router;
