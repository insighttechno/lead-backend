const asyncHandler = require('express-async-handler');
const EmailTemplate = require('../models/EmailTemplate');

// @desc    Get all email templates for the company
// @route   GET /api/templates
// @access  Private
const getTemplates = asyncHandler(async (req, res) => {
  const { search, type, status, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { templateName: { $regex: search, $options: 'i' } },
      { templateType: { $regex: search, $options: 'i' } },
    ];
  }
  if (type) {
    query.templateType = type;
  }
  if (status) {
    query.status = status;
  }

  const templates = await EmailTemplate.find(query)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 })
    // Project only necessary fields and a short preview of contentHtml
    .select('templateType subject templateName status createdAt contentHtml'); // Keep contentHtml for full view later

  const count = await EmailTemplate.countDocuments(query);

  // Add a preview field to each template
  const templatesWithPreview = templates.map(template => ({
    ...template.toObject(), // Convert Mongoose document to plain JS object
    preview: template.contentHtml ? template.contentHtml.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'No content preview'
  }));

  res.json({
    templates: templatesWithPreview,
    totalPages: Math.ceil(count / limit),
    currentPage: parseInt(page), // Ensure currentPage is a number
    totalTemplates: count,
  });
});

// @desc    Get single email template
// @route   GET /api/templates/:id
// @access  Private
const getTemplate = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  res.json(req.resource);
});

// @desc    Create new email template
// @route   POST /api/templates
// @access  Private
const createTemplate = asyncHandler(async (req, res) => {
  const { templateType, templateName, contentHtml, status, subject } = req.body;

  if (!templateType || !templateName || !subject || !contentHtml) {
    res.status(400);
    throw new Error('Please fill all required fields: template type, name, and content');
  }

  const template = await EmailTemplate.create({
    companyId: req.companyId,
    templateType,
    templateName,
    subject,
    contentHtml,
    status,
    createdBy: req.user._id,
  });

  res.status(201).json({ message: 'Template created successfully', template });
});

// @desc    Update email template
// @route   PUT /api/templates/:id
// @access  Private
const updateTemplate = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const template = req.resource;
  const { templateType, templateName, subject, contentHtml, status } = req.body;

  template.templateType = templateType || template.templateType;
  template.templateName = templateName || template.templateName;
  template.subject = subject || template.subject;
  template.contentHtml = contentHtml || template.contentHtml;
  template.status = status || template.status;

  const updatedTemplate = await template.save();
  res.json({ message: 'Template updated successfully', template: updatedTemplate });
});

// @desc    Delete email template
// @route   DELETE /api/templates/:id
// @access  Private
const deleteTemplate = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const template = req.resource;

  await template.deleteOne();
  res.json({ message: 'Template removed successfully' });
});

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};