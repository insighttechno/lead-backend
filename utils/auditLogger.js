const AuditLog = require('../models/AuditLog');

const auditLogger = async (req, action, entityType, entityId = null, details = {}) => {
  try {
    if (!req.user || !req.companyId) {
      console.warn('AuditLog: Missing user or company ID in request. Action not logged:', action);
      return;
    }

    const ipAddress = req.headers['x-forwarded-for']?.split(',').shift() ||
                      req.socket?.remoteAddress ||
                      req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await AuditLog.create({
      companyId: req.companyId,
      userId: req.user._id,
      action: action,
      entityType: entityType,
      entityId: entityId,
      details: details,
      ipAddress: ipAddress,
      userAgent: userAgent,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};

module.exports = auditLogger;