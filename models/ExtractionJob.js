const mongoose = require('mongoose');

const ExtractionJobSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    keywordsUsed: {
      type: [String],
      required: [true, 'Keywords for extraction are required'],
    },
    status: {
      type: String,
      enum: ['Pending', 'Running', 'Completed', 'Failed', 'Cancelled'],
      default: 'Pending',
    },
    totalEmailsExtracted: {
      type: Number,
      default: 0,
    },
    emailsVerified: { // Number of emails verified (e.g., unique, valid format)
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    errorMessage: { // If job failed
      type: String,
    },
    extractedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    downloadUrl: { // URL to the exported CSV/JSON of leads for this job
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ExtractionJob', ExtractionJobSchema);