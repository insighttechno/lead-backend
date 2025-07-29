const asyncHandler = require('express-async-handler');
const CampaignEvent = require('../models/CampaignEvent');
const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const geoip = require('geoip-lite'); // For IP-based location, install: npm install geoip-lite

// Helper to get IP address from request (handles proxies)
const getIpAddress = (req) => {
    return req.headers['x-forwarded-for']?.split(',').shift() ||
           req.socket?.remoteAddress ||
           req.connection?.remoteAddress;
};

// @desc    Track email open
// @route   GET /api/track/open/:campaignId/:recipientId
// @access  Public (no authentication, since it's a pixel hit)
const trackOpen = asyncHandler(async (req, res) => {
    const { campaignId, recipientId } = req.params;
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers['user-agent'];
    let geo = null;
    if (ipAddress) {
        geo = geoip.lookup(ipAddress);
    }

    try {
        const campaign = await Campaign.findById(campaignId);
        const lead = await Lead.findById(recipientId);

        if (!campaign || !lead) {
            // Log error but don't expose sensitive info to the client
            console.warn(`Tracking attempt for invalid campaign (${campaignId}) or recipient (${recipientId}).`);
            return res.status(204).send(); // Send 204 No Content for pixel, even if error
        }

        // Check if an 'Opened' event for this campaign-recipient already exists
        const existingOpen = await CampaignEvent.findOne({
            campaignId,
            recipientEmail: lead.email,
            eventType: 'Opened',
        });

        if (!existingOpen) {
            await CampaignEvent.create({
                companyId: campaign.companyId,
                campaignId: campaignId,
                recipientEmail: lead.email,
                eventType: 'Opened',
                ipAddress: ipAddress,
                userAgent: userAgent,
                location: geo ? { country: geo.country, region: geo.region, city: geo.city } : undefined,
            });

            // Increment opened count on Campaign (denormalized)
            await Campaign.findByIdAndUpdate(campaignId, { $inc: { emailsOpened: 1 } });
            console.log(`Open tracked for campaign ${campaignId}, recipient ${lead.email}`);
        } else {
            console.log(`Duplicate open ignored for campaign ${campaignId}, recipient ${lead.email}`);
        }

    } catch (error) {
        console.error(`Error tracking open for campaign ${campaignId}, recipient ${recipientId}:`, error);
    }

    // Always send a 204 No Content response for pixel tracking
    // This is important so the browser doesn't try to render an image
    res.status(204).send();
});

// @desc    Track email click
// @route   GET /api/track/click/:campaignId/:recipientId
// @access  Public (no authentication)
const trackClick = asyncHandler(async (req, res) => {
    const { campaignId, recipientId } = req.params;
    const originalUrl = req.query.url;
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers['user-agent'];
    let geo = null;
    if (ipAddress) {
        geo = geoip.lookup(ipAddress);
    }


    try {
        const campaign = await Campaign.findById(campaignId);
        const lead = await Lead.findById(recipientId);

        if (!campaign || !lead || !originalUrl) {
            console.warn(`Tracking attempt for invalid click: campaign (${campaignId}), recipient (${recipientId}), or URL missing.`);
            return res.redirect(302, '/'); // Redirect to homepage or error page if invalid
        }

        // Record 'Clicked' event
        await CampaignEvent.create({
            companyId: campaign.companyId,
            campaignId: campaignId,
            recipientEmail: lead.email,
            eventType: 'Clicked',
            ipAddress: ipAddress,
            userAgent: userAgent,
            urlClicked: decodeURIComponent(originalUrl),
            location: geo ? { country: geo.country, region: geo.region, city: geo.city } : undefined,
        });

        // Increment clicked count on Campaign (denormalized)
        // Ensure not to double-count clicks from the same user within a short period if precise metrics are needed
        // For simplicity, we increment on every click event.
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { emailsClicked: 1 } });
        console.log(`Click tracked for campaign ${campaignId}, recipient ${lead.email}, URL: ${decodeURIComponent(originalUrl)}`);

        // Redirect the user to the original URL
        res.redirect(302, decodeURIComponent(originalUrl));

    } catch (error) {
        console.error(`Error tracking click for campaign ${campaignId}, recipient ${recipientId}:`, error);
        res.redirect(302, originalUrl || '/'); // Redirect to original URL or homepage on error
    }
});

module.exports = {
    trackOpen,
    trackClick,
};