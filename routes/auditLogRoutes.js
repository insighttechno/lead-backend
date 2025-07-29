const express = require('express');
const { getAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/authMiddleware'); // No checkCompanyOwnership here as AuditLog has companyId

const router = express.Router();

router.route('/')
  .get(protect, authorize('Admin'), getAuditLogs); // Only Admin can view audit logs

module.exports = router;