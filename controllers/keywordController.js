const asyncHandler = require('express-async-handler');
const Keyword = require('../models/Keyword');
const { Parser } = require('json2csv'); // <-- Add this import

// @desc    Get all keywords for the company
// @route   GET /api/keywords
// @access  Private
const getKeywords = asyncHandler(async (req, res) => {
  const { search, category, status, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { keywordText: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) {
    query.category = category;
  }
  if (status) {
    query.status = status;
  }

  const keywords = await Keyword.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await Keyword.countDocuments(query);

  res.json({
    keywords,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalKeywords: count,
  });
});

// @desc    Add a new keyword
// @route   POST /api/keywords
// @access  Private (Admin, Team Lead, Developer)
const addKeyword = asyncHandler(async (req, res) => {
  const { keywordText, category } = req.body;

  if (!keywordText) {
    res.status(400);
    throw new Error('Please add keyword text');
  }

  const keywordExists = await Keyword.findOne({ keywordText, companyId: req.companyId });
  if (keywordExists) {
    res.status(400);
    throw new Error('Keyword already exists for your company');
  }

  const newKeyword = await Keyword.create({
    companyId: req.companyId,
    keywordText,
    category,
    createdBy: req.user._id,
  });

  res.status(201).json({ message: 'Keyword added successfully', keyword: newKeyword });
});

// @desc    Update a keyword
// @route   PUT /api/keywords/:id
// @access  Private (Admin, Team Lead, Developer)
const updateKeyword = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const keyword = req.resource;
  const { keywordText, category, status } = req.body;

  if (keywordText) keyword.keywordText = keywordText; // Add validation if unique check needed
  if (category) keyword.category = category;
  if (status) keyword.status = status;

  const updatedKeyword = await keyword.save();
  res.json({ message: 'Keyword updated successfully', keyword: updatedKeyword });
});

// @desc    Delete a keyword
// @route   DELETE /api/keywords/:id
// @access  Private (Admin, Team Lead)
const deleteKeyword = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const keyword = req.resource;

  // Optional: Check if keyword is part of any pending/active extraction jobs
  // const extractionJobs = await ExtractionJob.countDocuments({ keywordsUsed: keyword.keywordText, status: { $in: ['Pending', 'Running'] } });
  // if (extractionJobs > 0) {
  //   res.status(400);
  //   throw new Error('Cannot delete keyword currently in use by active extraction jobs.');
  // }

  await keyword.deleteOne();
  res.json({ message: 'Keyword removed successfully' });
});

// @desc    Export all keywords for the company to CSV
// @route   GET /api/keywords/export-csv
// @access  Private
const exportKeywordsToCsv = asyncHandler(async (req, res) => {
  const keywords = await Keyword.find({ companyId: req.companyId }).select('keywordText category status usageCount createdAt'); // Select relevant fields

  const fields = [
    { label: 'Keyword Text', value: 'keywordText' },
    { label: 'Category', value: 'category' },
    { label: 'Status', value: 'status' },
    { label: 'Usage Count', value: 'usageCount' },
    { label: 'Created At', value: 'createdAt' },
  ];

  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(keywords);

  res.header('Content-Type', 'text/csv');
  res.attachment('keywords.csv');
  res.send(csv);
});

module.exports = {
  getKeywords,
  addKeyword,
  updateKeyword,
  deleteKeyword,
  exportKeywordsToCsv
};