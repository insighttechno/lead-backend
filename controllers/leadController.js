const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const ExtractionJob = require('../models/ExtractionJob');
const { performEmailExtraction } = require('../services/extractionService'); // Import the service
const { emailRegex } = require('../utils/validationUtils'); // Create this utility for regex

// Add a simple email regex utility if not already in utils/validationUtils.js
// utils/validationUtils.js
/*
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
module.exports = { emailRegex };
*/


// @desc    Start an email extraction job
// @route   POST /api/extract-emails/start
// @access  Private (Admin, Team Lead, Developer)
const startEmailExtraction = asyncHandler(async (req, res) => {
  const { keywords } = req.body;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    res.status(400);
    throw new Error('Please provide a list of keywords for extraction.');
  }

  // Create an extraction job entry
  const extractionJob = await ExtractionJob.create({
    companyId: req.companyId,
    keywordsUsed: keywords,
    extractedBy: req.user._id,
    status: 'Pending',
  });

  // Ideally, queue this job to a background worker
  // Example: someJobQueue.add('extractEmails', { jobId: extractionJob._id, companyId: req.companyId, keywords: keywords, extractedByUserId: req.user._id });
  // For now, we'll just call the service directly (blocking in real app, non-blocking for demo)
  performEmailExtraction(extractionJob._id, req.companyId, keywords, req.user._id)
    .catch(err => console.error(`Failed to initiate extraction job ${extractionJob._id}:`, err)); // Handle errors in job initiation

  res.status(202).json({
    message: 'Email extraction started. Check recent extractions for status updates.',
    jobId: extractionJob._id,
  });
});

// @desc    Get recent extraction jobs for the company
// @route   GET /api/extract-emails/recent
// @access  Private
const getRecentExtractions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, search } = req.query;

  const query = { companyId: req.companyId };
  if (status) {
    query.status = status;
  }
  if (search) {
    query.keywordsUsed = { $in: [new RegExp(search, 'i')] }; // Search by keyword text
  }

  const jobs = await ExtractionJob.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await ExtractionJob.countDocuments(query);

  res.json({
    extractions: jobs,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalExtractions: count,
  });
});

// @desc    Get details of a specific extraction job
// @route   GET /api/extract-emails/jobs/:id
// @access  Private
const getExtractionJobDetails = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership for ExtractionJob
  res.json(req.resource);
});

// @desc    Get all leads for the company
// @route   GET /api/leads
// @access  Private
const getLeads = asyncHandler(async (req, res) => {
  const { search, source, status, tags, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
    ];
  }
  if (source) {
    query.source = source;
  }
  if (status) {
    query.status = status;
  }
  if (tags && Array.isArray(tags)) {
    query.tags = { $all: tags };
  }

  const leads = await Lead.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await Lead.countDocuments(query);

  res.json({
    leads,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalLeads: count,
  });
});

// @desc    Add a single lead manually
// @route   POST /api/leads
// @access  Private (Admin, Team Lead, Developer)
const addLead = asyncHandler(async (req, res) => {
  const { email, firstName, lastName, phone, companyName, tags } = req.body;

  if (!email || !emailRegex.test(email)) {
    res.status(400);
    throw new Error('Please provide a valid email address.');
  }

  const leadExists = await Lead.findOne({ companyId: req.companyId, email });
  if (leadExists) {
    res.status(400);
    throw new Error('A lead with this email already exists in your company.');
  }

  const lead = await Lead.create({
    companyId: req.companyId,
    email,
    firstName,
    lastName,
    phone,
    companyName,
    source: 'Manual',
    tags: tags || [],
    createdBy: req.user._id,
    status: 'New'
  });

  res.status(201).json({ message: 'Lead added successfully', lead });
});

// @desc    Update a lead
// @route   PUT /api/leads/:id
// @access  Private (Admin, Team Lead, Developer)
const updateLead = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership for Lead
  const lead = req.resource;
  const { email, firstName, lastName, phone, companyName, status, tags } = req.body;

  if (email && email !== lead.email) {
      // Check if new email already exists for another lead in the company
      const emailConflict = await Lead.findOne({ companyId: req.companyId, email, _id: { $ne: lead._id } });
      if (emailConflict) {
          res.status(400);
          throw new Error('Another lead with this email already exists.');
      }
      lead.email = email;
  }
  if (firstName) lead.firstName = firstName;
  if (lastName) lead.lastName = lastName;
  if (phone) lead.phone = phone;
  if (companyName) lead.companyName = companyName;
  if (status) lead.status = status;
  if (tags && Array.isArray(tags)) lead.tags = tags;

  const updatedLead = await lead.save();
  res.json({ message: 'Lead updated successfully', lead: updatedLead });
});

// @desc    Delete a lead
// @route   DELETE /api/leads/:id
// @access  Private (Admin, Team Lead)
const deleteLead = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership for Lead
  const lead = req.resource;

  // Optional: check if lead is part of active campaigns
  // const campaignCount = await Campaign.countDocuments({ recipientListIds: { $in: [lead._id] }, status: { $in: ['Active', 'Scheduled'] } });
  // if (campaignCount > 0) {
  //     res.status(400);
  //     throw new Error('Cannot delete lead associated with active campaigns.');
  // }

  await lead.deleteOne();
  res.json({ message: 'Lead removed successfully' });
});

module.exports = {
  startEmailExtraction,
  getRecentExtractions,
  getExtractionJobDetails,
  getLeads,
  addLead,
  updateLead,
  deleteLead,
};