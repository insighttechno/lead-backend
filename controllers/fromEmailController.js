const asyncHandler = require('express-async-handler');
const FromEmail = require('../models/FromEmail');
const csv = require('csv-parser');
const { Readable } = require('stream');

const Company = require('../models/Company'); // To get global SMTP if needed
const nodemailer = require('nodemailer');

// @desc    Get all FROM email addresses for the company
// @route   GET /api/from-emails
// @access  Private
const getFromEmails = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { emailAddress: { $regex: search, $options: 'i' } },
      { fullName: { $regex: search, $options: 'i' } },
      { label: { $regex: search, $options: 'i' } },
    ];
  }
  if (status) {
    query.status = status;
  }

  const fromEmails = await FromEmail.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await FromEmail.countDocuments(query);

  res.json({
    fromEmails,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalEmails: count,
  });
});

// @desc    Get single FROM email address
// @route   GET /api/from-emails/:id
// @access  Private
const getFromEmail = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  res.json(req.resource);
});

// @desc    Add new FROM email address
// @route   POST /api/from-emails
// @access  Private (Admin, Lead Generation Specialist)
const addFromEmail = asyncHandler(async (req, res) => {
  const { emailAddress, label, fullName } = req.body;

  if (!emailAddress) {
    res.status(400);
    throw new Error('Please provide an email address');
  }

  const fromEmailExists = await FromEmail.findOne({ emailAddress, companyId: req.companyId });
  if (fromEmailExists) {
    res.status(400);
    throw new Error('This email address is already registered for your company.');
  }

  const newFromEmail = await FromEmail.create({
    companyId: req.companyId,
    emailAddress,
    label,
    fullName,
    createdBy: req.user._id,
    status: 'Verified', // New emails start as unverified
  });

  res.status(201).json({ message: 'FROM email added successfully', fromEmail: newFromEmail });
});

// @desc    Update FROM email address
// @route   PUT /api/from-emails/:id
// @access  Private (Admin, Lead Generation Specialist)
const updateFromEmail = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const fromEmail = req.resource;
  const { emailAddress, label, status, fullName } = req.body;

  if (emailAddress) fromEmail.emailAddress = emailAddress; // Add validation if unique check needed
  if (label) fromEmail.label = label;
  if (status) fromEmail.status = status;
  if (fullName) fromEmail.fullName = fullName; // Allow setting to empty string

  const updatedFromEmail = await fromEmail.save();
  res.json({ message: 'FROM email updated successfully', fromEmail: updatedFromEmail });
});

// @desc    Delete FROM email address
// @route   DELETE /api/from-emails/:id
// @access  Private (Admin, Lead Generation Specialist)
const deleteFromEmail = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const fromEmail = req.resource;

  await fromEmail.deleteOne();
  res.json({ message: 'FROM email removed successfully' });
});

// @desc    Bulk import FROM email addresses via CSV
// @route   POST /api/from-emails/bulk-import
// @access  Private (Admin, Lead Generation Specialist)
const bulkImportFromEmails = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a CSV file.');
  }

  const companyId = req.companyId;
  const createdBy = req.user._id;
  const results = [];
  const errors = [];
  let successCount = 0;

  const readableStream = new Readable();
  readableStream.push(req.file.buffer);
  readableStream.push(null);

  readableStream
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      for (const row of results) {
        const { emailAddress, label, fullName } = row;

        if (!emailAddress || !label) { // FullName can be optional as per the model
          errors.push({ row, message: 'Email Address and Label are required.' });
          continue;
        }

        try {
          const fromEmailExists = await FromEmail.findOne({ emailAddress, companyId });
          if (fromEmailExists) {
            errors.push({ row, message: 'Email address already exists for your company.' });
            continue;
          }

          await FromEmail.create({
            companyId,
            emailAddress,
            label,
            fullName: fullName || '', // Ensure fullName is saved, default to empty string
            createdBy,
            status: 'Verified', // Default to Verified for bulk import
          });
          successCount++;
        } catch (error) {
          errors.push({ row, message: error.message || 'Failed to import.' });
        }
      }

      res.status(200).json({
        message: 'Bulk import process completed.',
        successCount,
        totalProcessed: results.length,
        errors,
      });
    });
});

module.exports = {
  getFromEmails,
  getFromEmail,
  addFromEmail,
  updateFromEmail,
  deleteFromEmail,
  bulkImportFromEmails
};