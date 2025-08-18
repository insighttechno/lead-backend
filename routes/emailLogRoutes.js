const express = require('express');
const router = express.Router();
const EmailLog = require('../models/EmailLog');
const asyncHandler = require('express-async-handler');

// @route   POST /api/emaillogs
// @desc    Create a new email sending log
// @access  Public (or protected, depending on your app's security)
router.post('/', async (req, res) => {
    try {
        const {
            campaignId,
            fromEmail,
            toEmail,
            status,
            providerData,
            errorDetails
        } = req.body;

        // Basic validation
        if (!campaignId || !fromEmail || !toEmail || !status) {
            return res.status(400).json({
                msg: 'Please provide all required fields.'
            });
        }

        const newLog = new EmailLog({
            campaignId,
            fromEmail,
            toEmail,
            status,
            providerData,
            errorDetails
        });

        const savedLog = await newLog.save();
        res.status(201).json(savedLog);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/emaillogs/campaign/:campaignId
// @desc    Get email logs for a specific campaign
// @access  Private

router.get('/campaign/:campaignId', asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { search, status, page = 1, limit = 10 } = req.query;

    const query = { campaignId: campaignId };

    // Add search and status filters if they exist
    if (search) {
        query.toEmail = { $regex: search, $options: 'i' };
    }
    if (status) {
        query.status = status;
    }

    // Fetch logs with pagination
    const logs = await EmailLog.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ sendTimestamp: -1 });

    // Get the total count of logs for pagination metadata
    const count = await EmailLog.countDocuments(query);

    res.json({
        logs,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalLogs: count,
    });
}));

module.exports = router;