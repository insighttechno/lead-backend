const mongoose = require('mongoose');

const LeadSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    email: {
      type: String,
      required: [true, 'Lead email is required'],
      lowercase: true,
      trim: true,
      // unique: true, // Unique per company (handled by index)
    },
    firstName: { // Optional, but good to have
      type: String,
      trim: true,
    },
    lastName: { // Optional
      type: String,
      trim: true,
    },
    phone: { // Optional
      type: String,
      trim: true,
    },
    companyName: { // Optional
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ['Extraction', 'Manual', 'CSV Upload', 'API'], // Added API for future integrations
      required: true,
    },
    sourceDetails: { // Details specific to the source
      extractionJobId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExtractionJob',
        required: function() { return this.source === 'Extraction'; } // Required if source is Extraction
      },
      keyword: String, // Keyword used for extraction
      country: String, // Country associated with extraction
      fileName: String, // For CSV uploads
    },
    status: {
      type: String,
      enum: ['New', 'Verified', 'Bounced', 'Unsubscribed', 'Invalid'],
      default: 'New',
    },
    tags: { // For categorization or segmentation
      type: [String],
      default: [],
    },
    lastCampaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure email is unique per company for leads (prevents duplicate leads)
LeadSchema.index({ companyId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Lead', LeadSchema);