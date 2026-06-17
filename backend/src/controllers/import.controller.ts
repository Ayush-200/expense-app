import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { ImportProcessor } from '../utils/csvImport/importProcessor';

/**
 * POST /import/expenses/:groupId
 * Upload CSV file, run validations, and return report
 */
export const importExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    // Verify user is a member
    const membership = await prisma.groupMember.findFirst({
      where: { groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const exchangeRate = req.body.exchangeRate ? parseFloat(req.body.exchangeRate) : undefined;
    console.log(`[importExpenses] Processing file "${req.file.originalname}" for group ${groupId}, exchangeRate=${exchangeRate}`);

    const processor = new ImportProcessor();
    const report = await processor.process({
      groupId,
      userId,
      fileName: req.file.originalname,
      fileBuffer: req.file.buffer,
      autoFix: true, // autoFix safe anomalies
      exchangeRate,
    });

    console.log(`[importExpenses] Result: ${report.status}, ${report.totalRows} rows, ${report.anomalies.errors} errors`);
    return res.json(report);
  } catch (error: any) {
    console.error(`[importExpenses] Failed:`, error.message, error.stack);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /import/jobs/:jobId
 * Fetch details of an import job, including rows and anomalies
 */
export const getImportJob = async (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = req.user!.id;

    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      include: { anomalies: true },
    });

    if (!job) {
      return res.status(404).json({ message: 'Import job not found' });
    }

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: job.groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Retrieve group members for mapping dropdowns
    const members = await prisma.groupMember.findMany({
      where: { groupId: job.groupId },
      include: { user: true },
    });

    return res.json({
      job,
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * POST /import/jobs/:jobId/confirm
 * Finalize the import by applying user resolutions
 */
export const confirmImport = async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;
  try {
    const userId = req.user!.id;
    const { resolutions } = req.body;

    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({ message: 'Import job not found' });
    }

    // Verify user is a member of the group
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: job.groupId, userId, leftAt: null },
    });
    if (!membership) {
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log(`[confirmImport] Executing import for job ${jobId} with ${Object.keys(resolutions).length} resolutions`);
    const processor = new ImportProcessor();
    await processor.executeImport(jobId, resolutions);

    console.log(`[confirmImport] Import ${jobId} completed successfully`);
    const updatedJob = await prisma.importJob.findUnique({ where: { id: jobId } });
    return res.json({
      message: 'Import completed successfully',
      job: updatedJob,
    });
  } catch (error: any) {
    console.error(`[confirmImport] Import ${jobId} failed:`, error.message, error.stack);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * GET /import/template
 * Download CSV template
 */
export const downloadTemplate = async (req: AuthRequest, res: Response) => {
  const template = `date,description,amount,paidBy,splitType,participants,participantShares,currency
2024-01-15,Team lunch,1200.50,Alice,EQUAL,"Alice,Bob,Carol",,INR
2024-01-16,Office supplies,Bob,450.00,EQUAL,"Alice,Bob",,INR
2024-01-17,Coffee meeting,Alice,180.00,EQUAL,"Alice,Bob",,INR
2024-01-18,Dinner,Bob,-350.50,EQUAL,"Alice,Bob,Carol",,INR
2024-01-19,Settlement to Alice,Carol,500.00,EQUAL,Alice,,INR`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="expense_import_template.csv"');
  res.send(template);
};
