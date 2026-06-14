import { Router } from 'express';
import { getGroupBalances } from '../controllers/settlement.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/groups/:id/balances', authenticate, getGroupBalances);

export default router;
