const express = require('express');
const {
  getFromEmails,
  getFromEmail,
  addFromEmail,
  updateFromEmail,
  deleteFromEmail,
} = require('../controllers/fromEmailController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'FromEmail';
    next();
});

router.route('/')
  .get(protect, getFromEmails)
  .post(protect, authorize('Admin', 'Team Lead'), addFromEmail);

router.route('/:id')
  .get(protect, checkCompanyOwnership, getFromEmail)
  .put(protect, authorize('Admin', 'Team Lead'), checkCompanyOwnership, updateFromEmail)
  .delete(protect, authorize('Admin', 'Team Lead'), checkCompanyOwnership, deleteFromEmail);

module.exports = router;