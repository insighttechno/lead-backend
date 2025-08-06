const express = require('express');
const multer = require('multer');

const {
  getFromEmails,
  getFromEmail,
  addFromEmail,
  updateFromEmail,
  deleteFromEmail,
  bulkImportFromEmails
} = require('../controllers/fromEmailController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'FromEmail';
    next();
});

router.route('/')
  .get(protect, getFromEmails)
  .post(protect, authorize('Admin', 'Lead Generation Specialist'), addFromEmail);

router.post('/bulk-import', protect, authorize('Admin', 'Lead Generation Specialist'), upload.single('csvFile'), bulkImportFromEmails);

router.route('/:id')
  .get(protect, checkCompanyOwnership, getFromEmail)
  .put(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, updateFromEmail)
  .delete(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, deleteFromEmail);

module.exports = router;