import { Router } from 'express';
import {
  createGroup,
  getGroups,
  getGroup,
  addMember,
  addMembers,
  removeMember,
  leaveGroup,
  getMembershipHistory,
} from '../controllers/group.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:id', getGroup);
router.post('/:id/members', addMembers); // batch add (body: { userIds: [...] })
router.post('/:id/members/single', addMember); // single add (body: { userId })
router.delete('/:id/members/:memberId', removeMember);
router.post('/:id/leave', leaveGroup);
router.get('/:id/history', getMembershipHistory);

export default router;
