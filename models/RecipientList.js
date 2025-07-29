const mongoose = require('mongoose');

const RecipientListSchema = mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    listName: {
      type: String,
      required: [true, 'Please add a list name'],
      trim: true,
      unique: true, // Unique per company
    },
    description: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ['Manual', 'CSV Upload', 'Extracted Leads'],
      required: true,
    },
    totalContacts: {
      type: Number,
      default: 0,
    },
    // contacts: Array of ObjectIds referencing the 'Lead' collection
    contacts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    }],
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

// Ensure list name is unique per company
RecipientListSchema.index({ companyId: 1, listName: 1 }, { unique: true });

module.exports = mongoose.model('RecipientList', RecipientListSchema);