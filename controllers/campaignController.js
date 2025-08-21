const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const EmailTemplate = require('../models/EmailTemplate');
const ExtractionJob = require('../models/ExtractionJob'); // Make sure this is imported
const CampaignEvent = require('../models/CampaignEvent');
const mongoose = require('mongoose'); // Add this import

// Import the emailSendingQueue
const { emailSendingQueue } = require('../config/redis');

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
  const { search, status, templateId, page = 1, limit = 10 } = req.query;

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

  const campaigns = await Campaign.find(query)
    .populate([
          { path: 'templateIds' }
      ])
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
          { path: 'templateId' }
      ]);
  }
  res.json(campaign);
});

// @desc    Create new campaign
// @route   POST /api/campaigns
// @access  Private (Admin, Lead Generation Specialist, Senior Developer)
const createCampaign = asyncHandler(async (req, res) => {
  const { campaignName, templateIds, extractionJobIds, scheduleType, scheduledTime, status } = req.body;

  if (!campaignName || !templateIds || !Array.isArray(templateIds) || templateIds.length === 0 || !extractionJobIds || !Array.isArray(extractionJobIds) || extractionJobIds.length === 0) {
    res.status(400);
    throw new Error('Please fill all required campaign fields.');
  }

  const campaignExists = await Campaign.findOne({ campaignName, companyId: req.companyId });
  if (campaignExists) {
    res.status(400);
    throw new Error('A campaign with this name already exists for your company.');
  }

   // Validate existence of ALL Templates and ALL ExtractionJobs
  const templates = await EmailTemplate.find({ _id: { $in: templateIds }, companyId: req.companyId });
  const extractionJobs = await ExtractionJob.find({ _id: { $in: extractionJobIds }, companyId: req.companyId });
  
  if (templates.length !== templateIds.length) {
    throw new Error('One or more selected email templates not found or not accessible.');
  }
  if (extractionJobs.length !== extractionJobIds.length) {
    throw new Error('One or more selected extraction jobs not found or not accessible.');
  }

  // Calculate totalRecipients by summing up emails from all selected extraction jobs
  let totalRecipients = extractionJobs.reduce((sum, job) => sum + job.totalEmailsExtracted, 0);

  const newCampaign = await Campaign.create({
    companyId: req.companyId,
    campaignName,
    templateIds,
    extractionJobIds,
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
// @access  Private (Admin, Lead Generation Specialist, Senior Developer)
const updateCampaign = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware
  const campaign = req.resource;
  const { campaignName, templateIds, extractionJobIds, scheduleType, scheduledTime, status } = req.body;

  // Prevent updates if campaign is already active/completed/failed
  if (['Active', 'Completed', 'Failed'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Cannot update a campaign that is in '${campaign.status}' status.`);
  }

  if (campaignName) campaign.campaignName = campaignName;

   if (templateIds) { // Handle templateIds update
    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      res.status(400);
      throw new Error('templateIds must be a non-empty array.');
    }
    const templates = await EmailTemplate.find({ _id: { $in: templateIds }, companyId: req.companyId });
    if (templates.length !== templateIds.length) {
      res.status(400);
      throw new Error('One or more selected email templates not found or not accessible.');
    }
    campaign.templateIds = templateIds;
  }

  if (extractionJobIds) {
    if (!Array.isArray(extractionJobIds)) {
        res.status(400);
        throw new Error('extractionJobIds must be an array.');
    }
    // Validate all incoming extractionJobIds
    const jobs = await Promise.all(extractionJobIds.map(id => ExtractionJob.findOne({ _id: id, companyId: req.companyId })));
    if (jobs.some(job => !job)) {
        res.status(400);
        throw new Error('One or more selected extraction jobs not found or not accessible.');
    }

    campaign.extractionJobIds = extractionJobIds; // Update the array

    // Recalculate totalRecipients
    let newTotalRecipients = 0;
    for (const job of jobs) {
      if (job) {
        newTotalRecipients += job.totalEmailsExtracted;
      }
    }
    campaign.totalRecipients = newTotalRecipients;
  }

  if (scheduleType) campaign.scheduleType = scheduleType;
  campaign.scheduledTime = scheduleType === 'Schedule' ? scheduledTime : undefined;
  if (status) campaign.status = status; // Can transition from Draft to Scheduled, or Paused to Active

  const updatedCampaign = await campaign.save();
  res.json({ message: 'Campaign updated successfully', campaign: updatedCampaign });
});

// @desc    Delete campaign
// @route   DELETE /api/campaigns/:id
// @access  Private (Admin, Lead Generation Specialist)
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

async function fetchEmailsFromExtractionJobStorage(extractionJobId) {
    if (!extractionJobId) {
        throw new Error('Extraction Job ID is required to fetch leads.');
    }

    try {
        // Find all leads that are associated with this extraction job
        const leads = await Lead.find({ 'sourceDetails.extractionJobId': extractionJobId });

        if (leads.length === 0) {
            return []; // No leads found for this extraction job
        }

        // Extract unique emails from the found leads
        const uniqueEmails = new Set();
        leads.forEach(lead => {
            if (lead.email) {
                uniqueEmails.add(lead.email.toLowerCase().trim());
            }
        });

        return Array.from(uniqueEmails);
    } catch (error) {
        console.error(`Failed to fetch leads for extraction job ${extractionJobId}:`, error);
        throw new Error(`Error retrieving emails from leads for extraction job: ${error.message}`);
    }
}

async function getRecipientsForCampaign(campaignId) {
    const campaign = await Campaign.findById(campaignId).populate('extractionJobIds'); // Populate the jobs
    if (!campaign) {
        throw new Error('Campaign not found.');
    }

    let allEmails = new Set(); // Use a Set for automatic deduplication

    for (const job of campaign.extractionJobIds) {
        
        // Placeholder for fetching emails from the job
        const jobEmails = await fetchEmailsFromExtractionJobStorage(job._id); // A new function needed to get actual emails
        jobEmails.forEach(email => allEmails.add(email));
    }
    return Array.from(allEmails); // Return a unique list of emails
}

// @desc    Send campaign (initiates the sending process)
// @route   POST /api/campaigns/:id/send
// @access  Private (Admin, Lead Generation Specialist, Senior Developer)
const sendCampaign = asyncHandler(async (req, res) => {
  console.log('send API started');
  const campaign = req.resource; // From checkCompanyOwnership middleware

  // Ensure campaign is in a state that can be sent
  if (['Active', 'Completed', 'Failed'].includes(campaign.status)) {
    res.status(400);
    throw new Error(`Campaign is already in '${campaign.status}' status. Cannot send.`);
  }

  const recipientEmails = await getRecipientsForCampaign(campaign._id);
  if (recipientEmails.length === 0) {
    res.status(400);
    throw new Error('No recipients found for this campaign.');
  }

  // Fetch all templates for the campaign
  const emailTemplates = await EmailTemplate.find({ _id: { $in: campaign.templateIds } });
  if (emailTemplates.length === 0) {
    res.status(400);
    throw new Error('No email templates found for this campaign.');
  }

  campaign.status = 'Active'; // Or 'Queued' if you want a distinct status for "in queue"
  campaign.totalRecipients = recipientEmails.length;
  await campaign.save();
  console.log('recipientEmails',recipientEmails);
  // Add individual email sending jobs to the queue with a delay
  let currentDelay = 0;
  const DELAY_PER_EMAIL = 3000; // 3 seconds

  for (let i = 0; i < recipientEmails.length; i++) {

    const email = recipientEmails[i];
    // Select a random template for each email
    const randomTemplate = emailTemplates[Math.floor(Math.random() * emailTemplates.length)];
    
    await emailSendingQueue.add(
      'sendSingleEmail1', // Job name
      {
        campaignId: campaign._id,
        companyId: campaign.companyId,
        recipientEmail: email,
        subject: randomTemplate.subject,
        body: randomTemplate.contentHtml,
        templateId: randomTemplate._id,
      },
      {
        delay: currentDelay, // Delay this specific job
        // You can add more options here, e.g., attempts for retries:
        // attempts: 3,
        // backoff: { type: 'exponential', delay: 5000 },
      }
    );
    currentDelay += DELAY_PER_EMAIL; // Increment delay for the next email
  }
  res.json({ message: 'Campaign sending initiated. Check campaign status for updates.', campaignId: campaign._id });
});

// @desc    Pause a running campaign
// @route   POST /api/campaigns/:id/pause
// @access  Private (Admin, Lead Generation Specialist)
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
// @access  Private (Admin, Lead Generation Specialist)
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
// @access  Private (Admin, Lead Generation Specialist)
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

// @desc    Get all events for a specific campaign
// @route   GET /api/campaigns/:campaignId/events
// @access  Private
const getCampaignEvents = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { eventType, search, page = 1, limit = 10 } = req.query;
    
    // Validate that the campaignId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid campaign ID.' });
    }

    const query = { campaignId: new mongoose.Types.ObjectId(id) };

    // Add search and eventType filters
    if (search) {
        query.recipientEmail = { $regex: search, $options: 'i' };
    }
    if (eventType) {
        query.eventType = eventType;
    }

    // Fetch events with pagination and sorting
    const events = await CampaignEvent.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ timestamp: -1 });

    // Get the total count of events for pagination metadata
    const count = await CampaignEvent.countDocuments(query);

    res.json({
        events,
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
  getCampaignEvents
};