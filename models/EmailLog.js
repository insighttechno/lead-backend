const mongoose = require('mongoose');

const EmailLogSchema = new mongoose.Schema({
    campaignId: {
        type: String,
        required: true,
        // If you have a separate campaigns collection, you might use a mongoose.Schema.Types.ObjectId here
    },
    fromEmail: {
        type: String,
        required: true,
    },
    toEmail: {
        type: String,
        required: true,
    },
    sendTimestamp: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        required: true,
        enum: ['sent', 'failed', 'bounced', 'deferred'],
    },
    providerData: {
        type: Object, // Stores flexible data from the email service provider
    },
    errorDetails: {
        type: String,
    },
    // Optional: add a reference to a user or a specific campaign
    // userId: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'User'
    // }
}, {
    timestamps: true // Adds createdAt and updatedAt fields automatically
});

module.exports = mongoose.model('EmailLog', EmailLogSchema);