const mongoose = require('mongoose');

const CampaignSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    campaignName: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      unique: true, // Unique per company
    },
    subjectLine: {
      type: String,
      required: [true, 'Subject line is required'],
      trim: true,
    },
    fromEmailId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FromEmail',
      required: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailTemplate',
      required: true,
    },
    extractionJobIds: [ // Changed from extractionJobId to extractionJobIds (plural)
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExtractionJob',
      }
    ],
    scheduleType: {
      type: String,
      enum: ['Send Now', 'Schedule'],
      default: 'Send Now',
    },
    scheduledTime: {
      type: Date,
      required: function() { return this.scheduleType === 'Schedule'; },
    },
    status: {
      type: String,
      enum: ['Draft', 'Immediate', 'Scheduled', 'Active', 'Paused', 'Completed', 'Failed', 'Cancelled'],
      default: 'Draft',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalRecipients: { // Denormalized count, populated when campaign is prepared
      type: Number,
      default: 0,
    },
    emailsSent: {
      type: Number,
      default: 0,
    },
    emailsOpened: {
      type: Number,
      default: 0,
    },
    emailsClicked: {
      type: Number,
      default: 0,
    },
    emailsConverted: { // Requires external conversion tracking
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
    },
    // Metrics can be stored directly for quick access or aggregated from CampaignEvent
    // This simplifies dashboard queries but duplicates data. For high volume, prefer aggregation.
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Ensure campaign name is unique per company
CampaignSchema.index({ companyId: 1, campaignName: 1 }, { unique: true });

module.exports = mongoose.model('Campaign', CampaignSchema);