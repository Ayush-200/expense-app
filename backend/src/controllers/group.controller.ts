import { Response } from 'express';
import { prisma } from '../config/database';
import { createGroupSchema, addMemberSchema } from '../validations/group.validation';
import { AuthRequest } from '../types';

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = createGroupSchema.parse(req.body);
    const userId = req.user!.id;

    const group = await prisma.group.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        createdById: userId,
        members: {
          create: {
            userId: userId,
            joinedAt: new Date(),
          },
        },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          where: {
            leftAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      message: 'Group created successfully',
      group,
    });
  } catch (error) {
    throw error;
  }
};

export const getGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: userId,
            leftAt: null,
          },
        },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          where: {
            leftAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: {
              where: {
                leftAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ groups });
  } catch (error) {
    throw error;
  }
};

export const getGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const group = await prisma.group.findFirst({
      where: {
        id,
        members: {
          some: {
            userId: userId,
            leftAt: null,
          },
        },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          where: {
            leftAt: null,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found or access denied' });
    }

    res.json({ group });
  } catch (error) {
    throw error;
  }
};

export const addMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = addMemberSchema.parse(req.body);
    const requestUserId = req.user!.id;

    // Check if group exists and user is a member
    const group = await prisma.group.findFirst({
      where: {
        id,
        members: {
          some: {
            userId: requestUserId,
            leftAt: null,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found or access denied' });
    }

    // Check if user to add exists
    const userToAdd = await prisma.user.findUnique({
      where: { id: validatedData.userId },
    });

    if (!userToAdd) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is already an active member
    const existingMembership = await prisma.groupMember.findFirst({
      where: {
        groupId: id,
        userId: validatedData.userId,
        leftAt: null,
      },
    });

    if (existingMembership) {
      return res.status(400).json({ message: 'User is already a member of this group' });
    }

    // Add member (create new membership record)
    const membership = await prisma.groupMember.create({
      data: {
        groupId: id,
        userId: validatedData.userId,
        joinedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Member added successfully',
      membership,
    });
  } catch (error) {
    throw error;
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { id, memberId } = req.params;
    const requestUserId = req.user!.id;

    // Check if group exists and user is a member
    const group = await prisma.group.findFirst({
      where: {
        id,
        members: {
          some: {
            userId: requestUserId,
            leftAt: null,
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found or access denied' });
    }

    // Find active membership
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: id,
        userId: memberId,
        leftAt: null,
      },
    });

    if (!membership) {
      return res.status(404).json({ message: 'Member not found in this group' });
    }

    // Soft delete: set leftAt timestamp
    const updatedMembership = await prisma.groupMember.update({
      where: {
        id: membership.id,
      },
      data: {
        leftAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      message: 'Member removed successfully',
      membership: updatedMembership,
    });
  } catch (error) {
    throw error;
  }
};

export const leaveGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if user is a member
    const membership = await prisma.groupMember.findFirst({
      where: {
        groupId: id,
        userId: userId,
        leftAt: null,
      },
    });

    if (!membership) {
      return res.status(404).json({ message: 'You are not a member of this group' });
    }

    // Check if user is the creator
    const group = await prisma.group.findUnique({
      where: { id },
    });

    if (group?.createdById === userId) {
      return res.status(400).json({ message: 'Group creator cannot leave the group' });
    }

    // Soft delete: set leftAt timestamp
    await prisma.groupMember.update({
      where: {
        id: membership.id,
      },
      data: {
        leftAt: new Date(),
      },
    });

    res.json({ message: 'You have left the group successfully' });
  } catch (error) {
    throw error;
  }
};

export const getMembershipHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if user is a current member
    const isMember = await prisma.groupMember.findFirst({
      where: {
        groupId: id,
        userId: userId,
        leftAt: null,
      },
    });

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all membership history
    const history = await prisma.groupMember.findMany({
      where: {
        groupId: id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    res.json({ history });
  } catch (error) {
    throw error;
  }
};
