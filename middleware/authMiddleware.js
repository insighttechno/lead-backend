const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User'); // Adjust path if needed
const mongoose = require('mongoose');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user and company to the request object
      req.user = await User.findById(decoded.id).select('-password'); // Exclude password
      if (!req.user) {
        res.status(401);
        throw new Error('Not authorized, user not found');
      }
      req.companyId = req.user.companyId; // Attach companyId for data isolation

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403);
      throw new Error(`User role ${req.user.role} is not authorized to access this route`);
    }
    next();
  };
};

// Middleware to check if the requested resource belongs to the user's company
const checkCompanyOwnership = asyncHandler(async (req, res, next) => {
  const resourceId = req.params.id || req.params.jobId; // <-- Use this instead
  const Model = mongoose.model(req.resourceModel); // Dynamic model lookup (e.g., 'EmailTemplate')
  
  const resource = await Model.findById(resourceId);

  if (!resource) {
    res.status(404);
    throw new Error('Resource not found');
  }

  if (resource.companyId.toString() !== req.companyId.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this resource');
  }

  req.resource = resource; // Attach the found resource to the request for convenience
  next();
});

module.exports = { protect, authorize, checkCompanyOwnership };