// startWorker.js
require('dotenv').config(); // Load environment variables
const connectDB = require('./config/db');
require('./workers/emailWorker'); // This line starts the worker

connectDB();

// You might also want to gracefully close connections on shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down worker gracefully...');
  // await emailWorker.close(); // If you imported the worker instance
  await require('./config/redis').connection.quit(); // Close redis connection
  process.exit(0);
});