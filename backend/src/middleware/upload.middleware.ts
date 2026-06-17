import multer from 'multer';

// Store file in memory (not on disk)
const storage = multer.memoryStorage();

// File filter - only CSV
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});
