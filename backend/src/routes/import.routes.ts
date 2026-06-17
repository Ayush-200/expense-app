import { Router } from 'express';
import { importExpenses, downloadTemplate, getImportJob, confirmImport } from '../controllers/import.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/expenses/:groupId', upload.single('file'), importExpenses);
router.get('/template', downloadTemplate);
router.get('/jobs/:jobId', getImportJob);
router.post('/jobs/:jobId/confirm', confirmImport);

export default router;
