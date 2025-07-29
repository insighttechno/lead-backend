const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const FromEmail = require('../models/FromEmail');
const EmailTemplate = require('../models/EmailTemplate');
const RecipientList = require('../models/RecipientList');
const { sendCampaignEmails } = require('../services/emailSendingService'); // Import the service

// @desc    Get dashboard campaign summary (analytics)
// @route   GET /api/campaigns/summary
// @access  Private
const getCampaignSummary = asyncHandler(async (req, res) => {
  const companyId = req.companyId;

  const totalCampaigns = await Campaign.countDocuments({ companyId });
  const totalEmailsSent = await Campaign.aggregate([
    { $match: { companyId: companyId } },
    { $group: { _id: null, total: { $sum: '$emailsSent' } } }
  ]);

  // Aggregate open and click rates from CampaignEvent or denormalized fields
  // For more accurate aggregation, you'd use CampaignEvent.
  // Example for overall average from denormalized fields:
  const campaignAggregates = await Campaign.aggregate([
    { $match: { companyId: companyId, status: 'Completed' } },
    {
      $group: {
        _id: null,
        totalOpened: { $sum: '$emailsOpened' },
        totalSent: { $sum: '$emailsSent' },
        totalClicked: { $sum: '$emailsClicked' },
        totalConverted: { $sum: '$emailsConverted' },
      }
    }
  ]);

  let avgOpenRate = 0;
  let avgClickRate = 0;
  let avgConversionRate = 0;
  let revenueGenerated = 0; // Requires external integration/tracking

  if (campaignAggregates.length > 0) {
    const { totalOpened, totalSent, totalClicked, totalConverted } = campaignAggregates[0];
    if (totalSent > 0) {
      avgOpenRate = (totalOpened / totalSent) * 100;
      avgClickRate = (totalClicked / totalSent) * 100;
    }
    // Conversion rate logic depends on how 'converted' is tracked.
    // Assuming for now it's a ratio of conversions to sent emails.
    if (totalSent > 0) {
        avgConversionRate = (totalConverted / totalSent) * 100;
    }
  }


  res.json({
    totalCampaigns,
    totalEmailsSent: totalEmailsSent[0] ? totalEmailsSent[0].total : 0,
    avgOpenRate: avgOpenRate.toFixed(2),
    avgClickRate: avgClickRate.toFixed(2),
    avgConversionRate: avgConversionRate.toFixed(2),
    revenueGenerated: revenueGenerated.toFixed(2),
  });
});


// @desc    Get all campaigns for the company
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
  const { search, status, templateId, fromEmailId, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.campaignName = { $regex: search, $options: 'i' };
  }
  if (status) {
    query.status = status;
  }
  if (templateId) {
    query.templateId = templateId;
  }
  if (fromEmailId) {
    query.fromEmailId = fromEmailId;
  }

  const campaigns = await Campaign.find(query)
    .populate('fromEmailId', 'emailAddress label') // Get sender email info
    .populate('templateId', 'templateName') // Get template name
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await Campaign.countDocuments(query);

  res.json({
    campaigns,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalCampaigns: count,
  });
});

// @desc    Get single campaign
// @route   GET /api/campaigns/:id
// @access  Private
const getCampaign = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware for Campaign
  let campaign = req.resource; // This is the Campaign document from middleware

  if (campaign) { // Ensure campaign exists before populating
      campaign = await campaign.populate([
          { path: 'templateId' },
          { path: 'fromEmailId' },
          { path: 'recipientListIds' }
      ]);
  }
  res.json(campaign);
});

// @desc    Create new campaign
// @route   POST /api/campaigns
// @access  Private (Admin, Team Lead, Senior Developer)
const createCampaign = asyncHandler(async (req, res) => {
  const { campaignName, subjectLine, fromEmailId, templateId, recipientListIds, scheduleType, scheduledTime, status } = req.body;

  if (!campaignName || !subjectLine || !fromEmailId || !templateId || !recipientListIds || !Array.isArray(recipientListIds) || recipientListIds.length === 0) {
    res.status(400);
    throw new Error('Please fill all required campaign fields.');
  }

  const campaignExists = await Campaign.findOne({ campaignName, companyId: req.companyId });
  if (campaignExists) {
    res.status(400);
    throw new Error('A campaign with this name already exists for your company.');
  }

  // Validate existence of FromEmail, Template, RecipientLists
  const [fromEmail, template, lists] = await Promise.all([
    FromEmail.findOne({ _id: fromEmailId, companyId: req.companyId }),
    EmailTemplate.findOne({ _id: templateId, companyId: req.companyId }),
    RecipientList.find({ _id: { $in: recipientListIds }, companyId: req.companyId }),
  ]);

  if (!fromEmail) throw new Error('Selected FROM email not found or not accessible.');
  if (!template) throw new Error('Selected email template not found or not accessible.');
  if (lists.length !== recipientListIds.length) throw new Error('One or more recipient lists not found or not accessible.');

  // Calculate total recipients
  let totalRecipients = 0;
  for (const list of lists) {
    totalRecipients += list.contacts.length; // Summing up contact counts from all lists
  }


  const newCampaign = await Campaign.create({
    companyId: req.companyId,
    campaignName,
    subjectLine,
    fromEmailId,
    templateId,
    recipientListIds,
    scheduleType,
    scheduledTime: scheduleType === 'Schedule' ? scheduledTime : undefined,
    status: status || 'Draft',
    createdBy: req.user._id,
    totalRecipients, // Initial total, will be accurate after sending starts
  });

  res.status(201).json({ message: 'Campaign created successfully', campaign: newCampaign });
});

// @desc    Update campaign
// @route   PUT /api/campaigns/:id
// @access  Private (Admin, Team Lead, Senior Developer)
const updateCampaign = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const campaign = req.resource;
  const { campaignName, subjectLine, fromEmailId, templateId, recipientListIds, scheduleType, scheduledTime, status } = req.body;

  // Prevent updates if campaign is already active/completed/failed
  if (['Active', 'Completed', 'Failed'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Cannot update a campaign that is in '${campaign.status}' status.`);
  }

  if (campaignName) campaign.campaignName = campaignName;
  if (subjectLine) campaign.subjectLine = subjectLine;
  if (fromEmailId) campaign.fromEmailId = fromEmailId;
  if (templateId) campaign.templateId = templateId;
  if (recipientListIds) {
    // Validate recipient lists if updated
    const lists = await RecipientList.find({ _id: { $in: recipientListIds }, companyId: req.companyId });
    if (lists.length !== recipientListIds.length) {
      res.status(400);
      throw new Error('One or more recipient lists not found or not accessible.');
    }
    campaign.recipientListIds = recipientListIds;
    // Recalculate totalRecipients
    let totalRecipients = 0;
    for (const list of lists) {
      totalRecipients += list.contacts.length;
    }
    campaign.totalRecipients = totalRecipients;
  }
  if (scheduleType) campaign.scheduleType = scheduleType;
  campaign.scheduledTime = scheduleType === 'Schedule' ? scheduledTime : undefined;
  if (status) campaign.status = status; // Can transition from Draft to Scheduled, or Paused to Active

  const updatedCampaign = await campaign.save();
  res.json({ message: 'Campaign updated successfully', campaign: updatedCampaign });
});

// @desc    Delete campaign
// @route   DELETE /api/campaigns/:id
// @access  Private (Admin, Team Lead)
const deleteCampaign = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const campaign = req.resource;

  // Prevent deletion if campaign is active/scheduled
  if (['Active', 'Scheduled'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Cannot delete a campaign that is currently '${campaign.status}'. Pause or cancel it first.`);
  }

  await campaign.deleteOne();
  // Optional: Also delete associated CampaignEvents for this campaign
  await CampaignEvent.deleteMany({ campaignId: campaign._id });

  res.json({ message: 'Campaign removed successfully' });
});

// @desc    Send campaign (initiates the sending process)
// @route   POST /api/campaigns/:id/send
// @access  Private (Admin, Team Lead, Senior Developer)
const sendCampaign = asyncHandler(async (req, res) => {
  const campaign = req.resource; // From checkCompanyOwnership middleware

  // Ensure campaign is in a state that can be sent
  if (['Active', 'Completed', 'Failed'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Campaign is already in '${campaign.status}' status. Cannot send.`);
  }

  // Update campaign status to indicate sending initiated
  campaign.status = 'Scheduled'; // Or 'Active' if sending immediately
  await campaign.save();

  // IMPORTANT: Queue the actual sending process to a background job system
  // Example for a job queue (e.g., BullMQ, Agenda.js):
  // await emailQueue.add('sendCampaign', { campaignId: campaign._id });

  // For this example, we'll directly call the service (which simulates async work)
  // In production, this would be a separate worker process to avoid blocking
  sendCampaignEmails(campaign._id)
    .catch(err => console.error(`Failed to initiate campaign sending for ${campaign._id}:`, err));

  res.json({ message: 'Campaign sending initiated. Check campaign status for updates.', campaignId: campaign._id });
});

// @desc    Pause a running campaign
// @route   POST /api/campaigns/:id/pause
// @access  Private (Admin, Team Lead)
const pauseCampaign = asyncHandler(async (req, res) => {
  const campaign = req.resource;

  if (campaign.status !== 'Active' && campaign.status !== 'Scheduled') {
    res.status(400);
    throw new Error(`Campaign cannot be paused from '${campaign.status}' status.`);
  }

  campaign.status = 'Paused';
  await campaign.save();

  // If using a job queue, you would signal the worker to pause the job here
  res.json({ message: 'Campaign paused successfully', campaignId: campaign._id });
});

// @desc    Resume a paused campaign
// @route   POST /api/campaigns/:id/resume
// @access  Private (Admin, Team Lead)
const resumeCampaign = asyncHandler(async (req, res) => {
  const campaign = req.resource;

  if (campaign.status !== 'Paused') {
    res.status(400);
    throw new Error(`Campaign can only be resumed from 'Paused' status.`);
  }

  campaign.status = 'Active'; // Or 'Scheduled' if it was a scheduled campaign that got paused before start
  await campaign.save();

  // If using a job queue, you would signal the worker to resume the job here
  res.json({ message: 'Campaign resumed successfully', campaignId: campaign._id });
});

// @desc    Cancel a campaign (from Scheduled or Draft state)
// @route   POST /api/campaigns/:id/cancel
// @access  Private (Admin, Team Lead)
const cancelCampaign = asyncHandler(async (req, res) => {
  const campaign = req.resource;

  if (['Active', 'Completed', 'Failed'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Cannot cancel a campaign that is '${campaign.status}'.`);
  }

  campaign.status = 'Cancelled';
  await campaign.save();

  // If using a job queue, you would signal the worker to remove/cancel the job
  res.json({ message: 'Campaign cancelled successfully', campaignId: campaign._id });
});


// @desc    Get detailed campaign analytics for a specific campaign
// @route   GET /api/campaigns/:id/analytics
// @access  Private
const getCampaignAnalytics = asyncHandler(async (req, res) => {
    const campaign = req.resource; // From checkCompanyOwnership middleware

    // Get basic stats from the campaign document itself
    const { emailsSent, emailsOpened, emailsClicked, totalRecipients } = campaign;

    // Calculate rates
    const openRate = emailsSent > 0 ? (emailsOpened / emailsSent) * 100 : 0;
    const clickRate = emailsSent > 0 ? (emailsClicked / emailsSent) * 100 : 0;
    // conversionRate would need external integration

    // Get detailed event counts
    const eventCounts = await CampaignEvent.aggregate([
        { $match: { campaignId: campaign._id } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } }
    ]);

    const detailedEvents = {};
    eventCounts.forEach(event => {
        detailedEvents[event._id] = event.count;
    });

    // Get top clicked URLs (example aggregation)
    const topClickedUrls = await CampaignEvent.aggregate([
        { $match: { campaignId: campaign._id, eventType: 'Clicked', urlClicked: { $ne: null } } },
        { $group: { _id: '$urlClicked', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
    ]);

    // Get geographical distribution of opens/clicks (requires geoip-lite data)
    const geoDistribution = await CampaignEvent.aggregate([
        { $match: { campaignId: campaign._id, eventType: { $in: ['Opened', 'Clicked'] }, 'location.country': { $ne: null } } },
        { $group: { _id: '$location.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    res.json({
        campaignId: campaign._id,
        campaignName: campaign.campaignName,
        status: campaign.status,
        totalRecipients,
        emailsSent,
        emailsOpened,
        emailsClicked,
        openRate: openRate.toFixed(2),
        clickRate: clickRate.toFixed(2),
        detailedEvents, // { Sent: N, Opened: N, Clicked: N, Bounced: N, Failed: N, Unsubscribed: N }
        topClickedUrls,
        geoDistribution,
        // Add more metrics as needed
    });
});

// @desc    Get recipient activity for a specific campaign (e.g., who opened, who clicked)
// @route   GET /api/campaigns/:id/recipients-activity
// @access  Private
const getCampaignRecipientActivity = asyncHandler(async (req, res) => {
    const campaign = req.resource; // From checkCompanyOwnership middleware
    const { eventType, search, page = 1, limit = 10 } = req.query;

    const query = { campaignId: campaign._id };
    if (eventType) {
        query.eventType = eventType;
    }
    if (search) {
        query.recipientEmail = { $regex: search, $options: 'i' };
    }

    const activity = await CampaignEvent.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ timestamp: -1 });

    const count = await CampaignEvent.countDocuments(query);

    res.json({
        activity,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalEvents: count,
    });
});

module.exports = {
  getCampaignSummary,
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignAnalytics, // NEW
  getCampaignRecipientActivity, // NEW
};