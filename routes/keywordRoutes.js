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
  .post(protect, authorize('Admin', 'Team Lead', 'Developer', 'Senior Developer'), addKeyword);

router.route('/:id')
  .put(protect, authorize('Admin', 'Team Lead', 'Developer', 'Senior Developer'), checkCompanyOwnership, updateKeyword)
  .delete(protect, authorize('Admin', 'Team Lead'), checkCompanyOwnership, deleteKeyword);

router.get('/export-csv', protect, exportKeywordsToCsv); // <-- Add this route

module.exports = router;