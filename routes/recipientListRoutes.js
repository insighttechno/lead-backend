const express = require('express');
const {
  getRecipientLists,
  getRecipientList,
  createRecipientList,
  updateRecipientList,
  deleteRecipientList,
  importContactsToList,
} = require('../controllers/recipientListController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const multer = require('multer'); // For file uploads
const mongoose = require('mongoose');

const router = express.Router();

// Configure Multer for file uploads (CSV)
const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory as buffer
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB limit
  },
});

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'RecipientList';
    next();
});

router.route('/')
  .get(protect, getRecipientLists)
  .post(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), createRecipientList);

router.route('/:id')
  .get(protect, checkCompanyOwnership, getRecipientList)
  .put(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), checkCompanyOwnership, updateRecipientList)
  .delete(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, deleteRecipientList);

router.post('/:id/import-contacts', protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), upload.single('contactsCsv'), checkCompanyOwnership, importContactsToList);


module.exports = router;