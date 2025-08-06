const express = require('express');
const {
  startEmailExtraction,
  getRecentExtractions,
  getExtractionJobDetails,
  getLeads,
  addLead,
  updateLead,
  deleteLead,
  getLeadsByExtractionJob
} = require('../controllers/leadController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose');

const router = express.Router();

// Middleware to set the model name for checkCompanyOwnership for ExtractionJob and Lead
router.param('jobId', (req, res, next, id) => {
    req.resourceModel = 'ExtractionJob'; // For /jobs/:jobId routes
    next();
});
router.param('id', (req, res, next, id) => {
    if (req.originalUrl.includes('/api/leads')) { // Differentiate between lead ID and job ID
        req.resourceModel = 'Lead';
    }
    next();
});


// Email Extraction Routes
router.post('/extract-emails/start', protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), startEmailExtraction);
router.get('/extract-emails/recent', protect, getRecentExtractions);
router.get('/extract-emails/jobs/:jobId', protect, checkCompanyOwnership, getExtractionJobDetails);
// router.get('/extract-emails/jobs/:jobId/download', protect, checkCompanyOwnership, downloadExtractedEmails); // Implement download logic if files are generated

// Lead Management Routes
router.route('/leads')
  .get(protect, getLeads)
  .post(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), addLead);

  router.route('/leads/by-job/:id')
  .get(protect, getLeadsByExtractionJob);

router.route('/leads/:id')
  .put(protect, authorize('Admin', 'Lead Generation Specialist', 'Developer'), checkCompanyOwnership, updateLead)
  .delete(protect, authorize('Admin', 'Lead Generation Specialist'), checkCompanyOwnership, deleteLead);

module.exports = router;