require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const companyRoutes = require('./routes/companyRoutes');
const templateRoutes = require('./routes/templateRoutes');
const fromEmailRoutes = require('./routes/fromEmailRoutes'); // NEW
const keywordRoutes = require('./routes/keywordRoutes');       // NEW
const leadRoutes = require('./routes/leadRoutes');         // NEW
const campaignRoutes = require('./routes/campaignRoutes'); // NEW
const trackingRoutes = require('./routes/trackingRoutes'); // NEW
const auditLogRoutes = require('./routes/auditLogRoutes'); // NEW
const emailLogRoutes = require('./routes/emailLogRoutes');

// ... other routes

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(
    cors()
);

app.use(express.json()); // Enable parsing JSON request bodies

// Define API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', userRoutes); // Team management (using the same controller/router for simplicity)
app.use('/api/settings', companyRoutes); // Company settings often managed via a 'settings' endpoint
app.use('/api/templates', templateRoutes);
app.use('/api/from-emails', fromEmailRoutes); // NEW
app.use('/api/keywords', keywordRoutes);       // NEW
app.use('/api', leadRoutes); // Lead and Extraction routes (e.g., /api/leads, /api/extract-emails) // NEW
app.use('/api/campaigns', campaignRoutes); // NEW
app.use('/api', trackingRoutes); // Tracking routes (e.g., /api/track/open) // NEW (public endpoint)
app.use('/api/audit-logs', auditLogRoutes); // NEW
app.use('/api/emaillogs', emailLogRoutes);

// ... other routes

// Simple health check route
app.get('/', (req, res) => {
  res.send('LeadIgniter API is running...');
});

// Error handling middleware (should be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});