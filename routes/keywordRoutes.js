const express = require('express');
const {
  getKeywords,
  addKeyword,
  updateKeyword,
  deleteKeyword,
  exportKeywordsToCsv,
} = require('../controllers/keywordController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'Keyword';
    next();
});

router.route('/')
  .get(protect, getKeywords)
  .post(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer', 'Senior Developer'), addKeyword);

router.route('/:id')
  .put(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer', 'Senior Developer'), checkCompanyOwnership, updateKeyword)
  .delete(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, deleteKeyword);

router.get('/export-csv', protect, exportKeywordsToCsv); // <-- Add this route

module.exports = router;