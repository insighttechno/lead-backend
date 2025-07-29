const mongoose = require('mongoose');

const EmailTemplateSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    templateType: {
      type: String,
      required: [true, 'Please specify a template type'],
    },
    templateName: {
      type: String,
      required: [true, 'Please add a template name'],
      unique: true, // Unique within a company (handled by index)
    },
    contentHtml: {
      type: String,
      required: [true, 'Please add HTML content for the template'],
    },
    status: {
      type: String,
      enum: ['Active', 'Draft'],
      default: 'Draft',
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

// Ensure template name is unique per company
EmailTemplateSchema.index({ companyId: 1, templateName: 1 }, { unique: true });

module.exports = mongoose.model('EmailTemplate', EmailTemplateSchema);