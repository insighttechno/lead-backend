const express = require('express');
const { trackOpen, trackClick } = require('../controllers/trackingController');

const router = express.Router();

// Public routes for email tracking (no authentication middleware needed)
router.get('/track/open/:campaignId/:recipientId', trackOpen);
router.get('/track/click/:campaignId/:recipientId', trackClick);

module.exports = router;