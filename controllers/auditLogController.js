const asyncHandler = require('express-async-handler');
const AuditLog = require('../models/AuditLog');

// @desc    Get audit logs for the company
// @route   GET /api/audit-logs
// @access  Private (Admin only)
const getAuditLogs = asyncHandler(async (req, res) => {
  const { search, entityType, action, userId, startDate, endDate, page = 1, limit = 20 } = req.query;

  const query = { companyId: req.companyId };

  if (search) {
    // Search in action or details (simple text search in details)
    query.$or = [
      { action: { $regex: search, $options: 'i' } },
      { 'details.reason': { $regex: search, $options: 'i' } }, // Example: for login failed reasons
      { 'details.message': { $regex: search, $options: 'i' } },
    ];
  }
  if (entityType) {
    query.entityType = entityType;
  }
  if (action) {
    query.action = action;
  }
  if (userId) {
    query.userId = userId;
  }
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }

  const logs = await AuditLog.find(query)
    .populate('userId', 'firstName lastName email') // Populate user who performed the action
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 }); // Most recent first

  const count = await AuditLog.countDocuments(query);

  res.json({
    logs,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalLogs: count,
  });
});

module.exports = {
  getAuditLogs,
};