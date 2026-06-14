import { Router } from 'express';
import {
  getGroupBalances,
  getMyBalances,
  createSettlement,
  getSettlementHistory,
  deleteSettlement,
} from '../controllers/settlement.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/groups/:id/balances', getGroupBalances);
router.get('/groups/:id/history', getSettlementHistory);
router.post('/groups/:id', createSettlement);
router.delete('/:settlementId', deleteSettlement);
router.get('/me', getMyBalances);

export default router;
