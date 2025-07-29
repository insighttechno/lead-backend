const express = require('express');
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = require('../controllers/templateController');
const { protect, checkCompanyOwnership } = require('../middleware/authMiddleware'); // Assuming any logged in user can manage templates
const mongoose = require('mongoose'); // Needed for dynamic model lookup in checkCompanyOwnership

const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'EmailTemplate';
    next();
});

router.route('/')
  .get(protect, getTemplates)
  .post(protect, createTemplate);

router.route('/:id')
  .get(protect, checkCompanyOwnership, getTemplate)
  .put(protect, checkCompanyOwnership, updateTemplate)
  .delete(protect, checkCompanyOwnership, deleteTemplate);

module.exports = router;