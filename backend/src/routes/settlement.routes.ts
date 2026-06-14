import { Router } from 'express';
import { getGroupBalances, getMyBalances } from '../controllers/settlement.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/groups/:id/balances', getGroupBalances);
router.get('/me', getMyBalances);

export default router;
