const mongoose = require('mongoose');

const KeywordSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    keywordText: {
      type: String,
      required: [true, 'Please add a keyword text'],
      trim: true,
      unique: true, // Unique per company
    },
    category: {
      type: String,
      trim: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
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

// Ensure keywordText is unique per company
KeywordSchema.index({ companyId: 1, keywordText: 1 }, { unique: true });

module.exports = mongoose.model('Keyword', KeywordSchema);