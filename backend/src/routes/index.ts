import { Router } from 'express';
import authRoutes from './auth.routes';
import groupRoutes from './group.routes';
import userRoutes from './user.routes';
import expenseRoutes from './expense.routes';
import settlementRoutes from './settlement.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/groups', groupRoutes);
router.use('/users', userRoutes);
router.use('/expenses', expenseRoutes);
router.use('/settlements', settlementRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
