const mongoose = require('mongoose');

const CampaignEventSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
    },
    // Using recipient email directly for simplicity. Can reference Lead._id if preferred.
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    templateId: { // New field
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailTemplate',
      required: true,
    },
    eventType: {
      type: String,
      enum: ['Sent', 'Opened', 'Clicked', 'Bounced', 'Unsubscribed', 'Failed'],
      required: true,
    },
    fromEmail: {
        type: String,
        required: true,
    },
    emailContent: {
        type: String,
        required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    ipAddress: { // Optional: for tracking location of event
      type: String,
    },
    userAgent: { // Optional: for tracking client of open/click
      type: String,
    },
    urlClicked: { // For 'Clicked' events
      type: String,
    },
    bounceReason: { // For 'Bounced' events
      type: String,
    },
    unsubReason: { // For 'Unsubscribed' events
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Efficiently query events for a specific campaign or recipient
CampaignEventSchema.index({ campaignId: 1, eventType: 1, recipientEmail: 1 });
CampaignEventSchema.index({ recipientEmail: 1, eventType: 1, timestamp: -1 });
CampaignEventSchema.index({ companyId: 1, timestamp: -1 }); // For general reporting

module.exports = mongoose.model('CampaignEvent', CampaignEventSchema);