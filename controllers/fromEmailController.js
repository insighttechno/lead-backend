const asyncHandler = require('express-async-handler');
const FromEmail = require('../models/FromEmail');
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
// @access  Private (Admin, Team Lead)
const addFromEmail = asyncHandler(async (req, res) => {
  const { emailAddress, label } = req.body;

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
    createdBy: req.user._id,
    status: 'Unverified', // New emails start as unverified
  });

  res.status(201).json({ message: 'FROM email added successfully', fromEmail: newFromEmail });
});

// @desc    Update FROM email address
// @route   PUT /api/from-emails/:id
// @access  Private (Admin, Team Lead)
const updateFromEmail = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const fromEmail = req.resource;
  const { emailAddress, label, status } = req.body;

  if (emailAddress) fromEmail.emailAddress = emailAddress; // Add validation if unique check needed
  if (label) fromEmail.label = label;
  if (status) fromEmail.status = status;

  const updatedFromEmail = await fromEmail.save();
  res.json({ message: 'FROM email updated successfully', fromEmail: updatedFromEmail });
});

// @desc    Delete FROM email address
// @route   DELETE /api/from-emails/:id
// @access  Private (Admin, Team Lead)
const deleteFromEmail = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const fromEmail = req.resource;

  await fromEmail.deleteOne();
  res.json({ message: 'FROM email removed successfully' });
});

module.exports = {
  getFromEmails,
  getFromEmail,
  addFromEmail,
  updateFromEmail,
  deleteFromEmail,
};