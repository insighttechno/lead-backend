// services/emailSendingService.js

const nodemailer = require('nodemailer');
const FromEmail = require('../models/FromEmail');
const Company = require('../models/Company');
const Campaign = require('../models/Campaign');
const CampaignEvent = require('../models/CampaignEvent');
const Lead = require('../models/Lead');

// Helper to get Nodemailer transporter (re-used from fromEmailController)
const getTransporter = async (fromEmailId, companyId) => {
    const fromEmail = await FromEmail.findById(fromEmailId);
    if (!fromEmail) throw new Error('FROM email not found');

    const company = await Company.findById(companyId);
    if (!company) throw new Error('Company not found');

    const config = fromEmail.smtpConfig.host ? fromEmail.smtpConfig : company.smtpConfig;

    if (!config || !config.host || !config.port || !config.username || !config.password) {
        throw new Error('SMTP configuration is incomplete for sending.');
    }

    const smtpOptions = {
        host: config.host,
        port: config.port,
        secure: config.security === 'SSL/TLS' ? true : false,
        auth: {
            user: config.username,
            pass: config.password, // This password will be decrypted by model's post-find hook
        },
        tls: { rejectUnauthorized: false }, // Use with caution in production! For self-signed certs
    };
    if (config.security === 'STARTTLS') {
        smtpOptions.secure = false;
        smtpOptions.requireTLS = true;
    } else if (config.security === 'None') {
        smtpOptions.secure = false;
        smtpOptions.ignoreTLS = true;
    }

    return nodemailer.createTransport(smtpOptions);
};

// --- NEW Tracking Helper Functions ---
// You'll need to set your base tracking domain in your environment variables (e.g., process.env.TRACKING_DOMAIN)
const TRACKING_DOMAIN = process.env.TRACKING_DOMAIN || 'http://localhost:5000'; // IMPORTANT: Use your actual domain here!

const generateTrackingPixelUrl = (campaignId, recipientId) => {
    // This URL will hit your API to record an open
    return `${TRACKING_DOMAIN}/api/track/open/${campaignId}/${recipientId}`;
};

const generateClickTrackingUrl = (campaignId, recipientId, originalUrl) => {
    // This URL will hit your API, record a click, then redirect to originalUrl
    // Encode the original URL to prevent issues with special characters
    return `${TRACKING_DOMAIN}/api/track/click/${campaignId}/${recipientId}?url=${encodeURIComponent(originalUrl)}`;
};

const applyTrackingToHtml = (htmlContent, campaignId, recipientId) => {
    let modifiedHtml = htmlContent;

    // 1. Add tracking pixel for opens
    const pixelUrl = generateTrackingPixelUrl(campaignId, recipientId);
    modifiedHtml += `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="pixel" />`;

    // 2. Rewrite links for click tracking
    // This is a basic regex replacement. For more robust HTML parsing, consider a library like 'cheerio'.
    modifiedHtml = modifiedHtml.replace(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi, (match, quote, url) => {
        if (url.startsWith('mailto:') || url.startsWith('#')) { // Don't track mailto or anchor links
            return match;
        }
        const trackingUrl = generateClickTrackingUrl(campaignId, recipientId, url);
        return `<a href="${trackingUrl}"`; // Keep original attributes, just change href
    });

    return modifiedHtml;
};
// --- END NEW Tracking Helper Functions ---


// Function to perform the actual email sending for a campaign
// This would be run by a background worker for bulk sending
const sendCampaignEmails = async (campaignId) => {
    console.log(`[Email Sending Service] Starting sending for campaign ${campaignId}`);

    const campaign = await Campaign.findById(campaignId)
        .populate('templateId')
        .populate('fromEmailId')
        .populate('recipientListIds'); // Populate all related data needed

    if (!campaign) {
        console.error(`Campaign ${campaignId} not found.`);
        return;
    }

    if (campaign.status !== 'Active' && campaign.status !== 'Scheduled') {
        console.warn(`Campaign ${campaignId} is not in an active or scheduled state. Skipping sending.`);
        return;
    }

    campaign.status = 'Active'; // Ensure status is Active when sending starts
    campaign.lastSentAt = new Date();
    await campaign.save();

    let sentCount = 0;
    let failedCount = 0;

    const allRecipientLeadIds = [];
    campaign.recipientListIds.forEach(list => {
        allRecipientLeadIds.push(...list.contacts);
    });

    // Fetch unique leads from the combined list of recipient IDs
    const uniqueLeads = await Lead.find({
        _id: { $in: allRecipientLeadIds },
        companyId: campaign.companyId,
        status: { $nin: ['Bounced', 'Unsubscribed', 'Invalid'] } // Only send to valid leads
    }).select('email firstName lastName');

    campaign.totalRecipients = uniqueLeads.length; // Update total recipients
    await campaign.save();


    if (uniqueLeads.length === 0) {
        console.log(`No valid recipients for campaign ${campaignId}.`);
        campaign.status = 'Completed';
        await campaign.save();
        return;
    }

    let transporter;
    try {
        transporter = await getTransporter(campaign.fromEmailId._id, campaign.companyId);
        await transporter.verify(); // Verify transporter before sending
    } catch (smtpError) {
        console.error(`SMTP connection error for campaign ${campaignId}:`, smtpError);
        campaign.status = 'Failed';
        campaign.errorMessage = `SMTP setup failed: ${smtpError.message}`;
        await campaign.save();
        return;
    }

    for (const lead of uniqueLeads) {
        if (campaign.status === 'Paused' || campaign.status === 'Cancelled') {
            console.log(`Campaign ${campaignId} paused/cancelled. Stopping sending.`);
            break; // Stop sending if campaign is paused/cancelled mid-way
        }

        const recipientName = lead.firstName ? `${lead.firstName} ${lead.lastName || ''}`.trim() : lead.email;
        const personalizedSubject = campaign.subjectLine.replace(/\{\{name\}\}/g, recipientName).replace(/\{\{email\}\}/g, lead.email);
        let personalizedHtml = campaign.templateId.contentHtml.replace(/\{\{name\}\}/g, recipientName).replace(/\{\{email\}\}/g, lead.email);

        // Apply tracking to the HTML content
        personalizedHtml = applyTrackingToHtml(personalizedHtml, campaign._id, lead._id);


        try {
            // Send email
            const info = await transporter.sendMail({
                from: `${campaign.fromEmailId.label || campaign.fromEmailId.emailAddress} <${campaign.fromEmailId.emailAddress}>`,
                to: lead.email,
                subject: personalizedSubject,
                html: personalizedHtml,
                // Add text version for better deliverability
                text: personalizedHtml.replace(/<\/?[^>]+(>|$)/g, ""), // Simple HTML to text conversion
            });
            console.log(`Email sent to ${lead.email}: ${info.messageId}`);
            sentCount++;

            // Record "Sent" event
            await CampaignEvent.create({
                companyId: campaign.companyId,
                campaignId: campaign._id,
                recipientEmail: lead.email,
                eventType: 'Sent',
                timestamp: new Date(),
            });

        } catch (emailError) {
            console.error(`Failed to send email to ${lead.email} for campaign ${campaignId}:`, emailError);
            failedCount++;
            await CampaignEvent.create({
                companyId: campaign.companyId,
                campaignId: campaign._id,
                recipientEmail: lead.email,
                eventType: 'Failed',
                timestamp: new Date(),
                bounceReason: emailError.message, // Or parse error for bounce type
            });
            // Mark lead as 'Invalid' or 'Bounced' based on specific error codes if available
            await Lead.updateOne({ _id: lead._id }, { $set: { status: 'Invalid' } });
        }
    }

    // Update campaign statistics
    campaign.emailsSent = sentCount;
    // For opens/clicks/bounces, these will be updated by the tracking endpoints or an analytics job
    // campaign.emailsOpened = openedCount;
    // campaign.emailsClicked = clickedCount;

    campaign.status = 'Completed'; // Mark as completed after sending attempt
    await campaign.save();

    console.log(`[Email Sending Service] Campaign ${campaignId} finished. Sent: ${sentCount}, Failed: ${failedCount}`);
};

module.exports = { sendCampaignEmails };