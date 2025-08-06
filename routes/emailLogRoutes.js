const express = require('express');
const router = express.Router();
const EmailLog = require('../models/EmailLog');

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

module.exports = router;