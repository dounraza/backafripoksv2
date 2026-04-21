import express from 'express';
import { getTables } from '../controllers/tableController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getTables);

export default router;
