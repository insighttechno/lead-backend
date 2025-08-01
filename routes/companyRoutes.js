const express = require('express');
const {
  getCompanySettings,
  updateCompanySettings,
} = require('../controllers/companyController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, authorize('Admin', 'Team Lead'), getCompanySettings)
  .put(protect, authorize('Admin'), updateCompanySettings);

module.exports = router;