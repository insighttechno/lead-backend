const axios = require("axios");
const qs = require("qs");
const path = require('path');
const FromEmail = require("../models/FromEmail");
const Company = require('../models/Company');
const CampaignEvent = require('../models/CampaignEvent'); // Your Mongoose model

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Function to get an application-only access token for Microsoft Graph
async function getAppToken(companyId) {

    const company = await Company.findById(companyId); 

    const tenantId = company.smtpConfig.tenantId;
    const clientId = company.smtpConfig.clientId;
    const clientSecret = company.smtpConfig.clientSecret;

    if (!company || !company.smtpConfig || !company.smtpConfig.tenantId || !company.smtpConfig.clientId || !company.smtpConfig.clientSecret) {
        throw new Error('Company not found or API key is missing.');
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const data = qs.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });
    try {
        const response = await axios.post(tokenUrl, data, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return response.data.access_token;
    } catch (error) {
        console.error("Error getting application token:", error.response ? error.response.data : error.message);
        throw new Error("Failed to obtain application access token for Microsoft Graph.");
    }
}

// Function to send a single email via Microsoft Graph API
async function sendEmailViaGraph(campaignId, toEmailAddress, subject, body, companyId, templateId) {

    const accessToken = await getAppToken(companyId);

    if (!accessToken) {
        throw new Error('Microsoft Graph API access token is missing. Please configure it.');
    }

    // --- Dynamic Sender Selection Logic ---
    let selectedSender;
    try {
        // Find all active sender emails from the database
        const activeSenders = await FromEmail.find({ status: "Verified" }).sort({ lastUsedAt: 1 }).exec();

        if (activeSenders.length === 0) {
            throw new Error('No active sender emails found in the database.');
        }

        // Simple random selection from the list, sorted by least recently used
        const randomIndex = Math.floor(Math.random() * activeSenders.length);
        selectedSender = activeSenders[randomIndex];
    } catch (dbError) {
        console.error("Error selecting sender from database:", dbError.message);
        throw new Error("Failed to select a sender email from the database.");
    }

    const fromEmailAddress = selectedSender.emailAddress;
    const fromEmailName = selectedSender.fullName;

    // Replace the placeholder in the body before sending
    let finalBody = body;
    if (fromEmailName && body.includes('{{sender_name}}')) {
        finalBody = body.replace(/{{sender_name}}/g, fromEmailName);
    }

    try {
        const url = `https://graph.microsoft.com/v1.0/users/${fromEmailAddress}/sendMail`; 
        const emailPayload = {
            message: {
                subject: subject, 
                body: {
                    contentType: "HTML", 
                    content: finalBody, 
                },
                toRecipients: [{
                    emailAddress: { address: toEmailAddress },
                }],
            },
            saveToSentItems: true
        };

        const res = await axios.post(url, emailPayload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        console.log(`Email sent successfully via Graph to ${toEmailAddress} from ${fromEmailAddress}`);

        // Log the successful email send
        try {
            const newCampaignEvent = new CampaignEvent({
                companyId,
                campaignId,
                fromEmail: fromEmailAddress,
                recipientEmail: toEmailAddress,
                eventType: 'sent',
                templateId,
                errorMessage: error.message,
                timestamp: new Date(),
            });
            await newCampaignEvent.save();
            console.log('Email send logged successfully.');
        } catch (logError) {
            console.error('Failed to log email send:', logError.message);
            // Don't re-throw, as the email was successfully sent.
        }

        // Update the lastUsedAt timestamp for the selected sender
        selectedSender.lastUsedAt = new Date();
        await selectedSender.save();

        return res.data;
    } catch (error) {
        console.error(`Error sending email via Microsoft Graph to ${toEmailAddress}:`, error.message);
        if (error.response) {
            console.error(`Graph API Status Code: ${error.response.status}`);
            console.error(`Graph API Error Body: ${JSON.stringify(error.response.data)}`);
        }

        // Log the failed email send
        try {
            const newCampaignEvent = new CampaignEvent({
                companyId,
                campaignId,
                fromEmail: fromEmailAddress,
                recipientEmail: toEmailAddress,
                eventType: 'Failed',
                templateId,
                errorMessage: error.message,
                timestamp: new Date(),
            });
            await newCampaignEvent.save();
            console.log('Failed email send logged successfully.');
        } catch (logError) {
            console.error('Failed to log email send error:', logError.message);
        }

        throw error;
    }
}

module.exports = { sendEmailViaGraph };