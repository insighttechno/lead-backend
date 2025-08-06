const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const ExtractionJob = require('../models/ExtractionJob');
const { performEmailExtraction } = require('../services/extractionService'); // Import the service
const { emailRegex } = require('../utils/validationUtils'); // Create this utility for regex

// @desc    Get all leads for a specific extraction job
// @route   GET /api/leads/by-job/:jobId
// @access  Private
const getLeadsByExtractionJob = asyncHandler(async (req, res) => {
    const { id } = req.params;
    // Find leads where the source is 'Extraction' and the specific extractionJobId matches
    const leads = await Lead.find({
        companyId: req.companyId,
        'sourceDetails.extractionJobId': id,
        source: 'Extraction'
    }).select('email firstName lastName companyName status'); // Select only relevant fields

    res.json({ leads });
});

// @desc    Start an email extraction job
// @route   POST /api/extract-emails/start
// @access  Private (Admin, Lead Generation Specialist, Developer)
const startEmailExtraction = asyncHandler(async (req, res) => {
  const { title, keywords } = req.body;

  // Validate title
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400);
    throw new Error('Please provide a title for the extraction job.');
  }

  // Validate keywords: now expecting a single string keyword
  if (!keywords || typeof keywords !== 'string' || keywords.trim().length === 0) {
    res.status(400);
    throw new Error('Please provide a single keyword for extraction.');
  }

  // Convert the single keyword string into an array for the schema
  const keywordsArray = [keywords.trim()];

  // Create an extraction job entry
  const extractionJob = await ExtractionJob.create({
    companyId: req.companyId,
    title: title,
    keywordsUsed: keywordsArray,
    extractedBy: req.user._id,
    status: 'Pending',
  });

  // Await the extraction service call to get the result
  // This makes the API call blocking until the extraction and saving are complete
  try {
    const { totalExtracted, totalVerified } = await performEmailExtraction(
      extractionJob._id,
      req.companyId,
      keywordsArray,
      req.user._id
    );

    res.status(202).json({
      message: 'Email extraction started and completed successfully!',
      jobId: extractionJob._id,
      totalEmailsExtracted: totalExtracted, // Return the actual counts
      emailsVerified: totalVerified,       // Return the actual counts
    });
  } catch (err) {
    // If performEmailExtraction fails, it will set the job status to 'Failed' internally.
    // Here, we just return an error to the client.
    console.error(`Error during email extraction for job ${extractionJob._id}:`, err);
    res.status(500); // Or 400 depending on the type of error
    throw new Error(`Failed to complete email extraction: ${err.message}`);
  }
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
// @access  Private (Admin, Lead Generation Specialist, Developer)
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
// @access  Private (Admin, Lead Generation Specialist, Developer)
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
// @access  Private (Admin, Lead Generation Specialist)
const deleteLead = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership for Lead
  const lead = req.resource;

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
  getLeadsByExtractionJob
};