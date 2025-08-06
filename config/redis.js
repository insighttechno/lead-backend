// config/redis.js
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Adjust path as needed

// Redis connection details from environment variables
const redisConfig = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined, // Only if you set a password
  tls: {
    // This empty object is often enough for ElastiCache,
    // as it trusts AWS's certificates by default.
    // If you encounter certificate issues (e.g., in development with self-signed),
    // you might need to provide a CA certificate file.
    //rejectUnauthorized: false // ONLY for development/testing, NEVER in production!
  },
  maxRetriesPerRequest: null, // Recommended for production with Redis
  enableOfflineQueue: false, // Recommended for production with Redis
  reconnectOnError: function (err) {
    const targetErrors = [/READONLY/, /ETIMEDOUT/];
    targetErrors.forEach(targetError => {
      if (err.message.includes(targetError.source)) {
        return true; // Reconnect on specific errors
      }
    });
    return false;
  },
};

// Create a reusable Redis connection instance
const connection = new Redis(redisConfig);

connection.on('connect', () => {
  console.log('Connected to Redis!');
});

connection.on('ready', () => {
  console.log('ioredis client is ready.');
});

connection.on('error', (err) => {
  //console.error('Redis connection error:', err);
});

connection.on('end', () => {
  console.log('ioredis client disconnected.');
});

// Define your BullMQ Queue
const emailSendingQueue = new Queue('sendSingleEmail1', 
  { 
    connection, 
    prefix: '{bullmq}:email1',
    defaultJobOptions: {
      attempts: 1, // Don't retry endlessly if the first attempt fails due to connection
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      timeout: 10000, // Timeout for job addition itself (e.g., if Redis is unreachable)
    },
  });

// THIS IS THE MOST IMPORTANT PART FOR DEBUGGING HANGS/CONNECTION ISSUES
emailSendingQueue.on('error', err => {
  //console.log('*** BullMQ Queue ERROR ***:', err);
  // You might also want to log more details here, e.g., to a file or a monitoring service
});

// Export the queue and connection
module.exports = {
  connection,
  emailSendingQueue,
};