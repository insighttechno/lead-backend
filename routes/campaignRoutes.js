const express = require('express');
const {
  getCampaignSummary,
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignAnalytics,
  getCampaignEvents,
  getCampaignRecipientActivity
} = require('../controllers/campaignController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    req.resourceModel = 'Campaign';
    next();
});

router.get('/summary', protect, getCampaignSummary); // Dashboard summary

router.route('/')
  .get(protect, getCampaigns)
  .post(protect, authorize('Admin', 'Lead Generation Specialist', 'Senior Developer'), createCampaign);

router.route('/:id')
  .get(protect, checkCompanyOwnership, getCampaign)
  .put(protect, authorize('Admin', 'Lead Generation Specialist', 'Senior Developer'), checkCompanyOwnership, updateCampaign)
  .delete(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, deleteCampaign);

router.post('/:id/send', protect, authorize('Admin', 'Lead Generation Specialist', 'Senior Developer'), checkCompanyOwnership, sendCampaign);
router.post('/:id/pause', protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, pauseCampaign);
router.post('/:id/resume', protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, resumeCampaign);
router.post('/:id/cancel', protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, cancelCampaign);

// New Reporting Routes for Campaigns
router.get('/:id/analytics', protect, checkCompanyOwnership, getCampaignAnalytics); // NEW
router.get('/:id/events', protect, checkCompanyOwnership, getCampaignEvents); // NEW
router.get('/:id/recipients-activity', protect, checkCompanyOwnership, getCampaignRecipientActivity); // NEW

module.exports = router;