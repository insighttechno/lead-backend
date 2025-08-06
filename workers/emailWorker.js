const { Worker } = require('bullmq');
const { connection } = require('../config/redis'); // Import the shared Redis connection
const Campaign = require('../models/Campaign'); // Your Mongoose model
const { sendEmailViaGraph } = require('../services/graphApiService');

const emailWorker = new Worker(
  'sendSingleEmail1', // Must match the queue name
  async (job) => {
    console.log('init email Worker', job);
    const { campaignId, recipientEmail, subject, body, companyId, templateId } = job.data;
    console.log(`Processing email job ${job.id} for Campaign ${campaignId} to ${recipientEmail}`);

    try {
      // Simulate your 3-second delay per email (as specified)
      // Note: This delay applies per worker process.
      // If you have multiple workers, they will process concurrently.
      // The delay you pass when adding the job (e.g., 3000 * index) is for sequential *queueing*,
      // this internal delay is for processing.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Call your Microsoft Graph API function
      await sendEmailViaGraph(campaignId, recipientEmail, subject, body, companyId, templateId);

      // Increment emailsSent count in Campaign model
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { emailsSent: 1 } });

      console.log(`Successfully sent email for Campaign ${campaignId} to ${recipientEmail}`);
    } catch (error) {
      console.error(`Failed to send email for Campaign ${campaignId} to ${recipientEmail}:`, error);
      // BullMQ will automatically retry jobs based on your queue options,
      // but re-throwing signals that this particular attempt failed.
      throw error;
    }
  },
  {
    connection, // Use the shared Redis connection
    prefix: '{bullmq}:email1',
    concurrency: 5, // Process 5 jobs at a time concurrently within this worker instance
    // Other BullMQ worker options:
    // removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
    // removeOnFail: { count: 500 },     // Keep last 500 failed jobs
  }
);

emailWorker.on('completed', (job) => {
  console.log(`Job ${job.id} for ${job.data.recipientEmail} completed.`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} for ${job.data.recipientEmail} failed: ${err.message}`);
});

emailWorker.on('error', (err) => {
  // Any errors that occur in the worker (e.g. redis connection error)
  console.error('Worker error:', err);
});

console.log('BullMQ Email Worker started.');