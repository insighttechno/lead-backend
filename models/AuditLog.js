const mongoose = require('mongoose');

const AuditLogSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'User', 'Company', 'EmailTemplate', 'FromEmail', 'Keyword',
        'Lead', 'RecipientList', 'Campaign', 'ExtractionJob', 'Auth'
      ],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'entityType', // Dynamically reference other models
    },
    details: {
      type: Object, // Stores specific changes or context (e.g., old value, new value, IP)
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true, // createdAt will be the log timestamp
  }
);

// Indexes for efficient querying
AuditLogSchema.index({ companyId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });


module.exports = mongoose.model('AuditLog', AuditLogSchema);