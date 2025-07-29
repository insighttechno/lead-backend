const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const generateToken = require('../utils/generateToken');
const auditLogger = require('../utils/auditLogger'); // NEW IMPORT

// @desc    Register a new user and company
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, companyName, password, confirmPassword } = req.body;

  if (!firstName || !lastName || !email || !companyName || !password || !confirmPassword) {
    res.status(400);
    throw new Error('Please enter all fields');
  }

  if (password !== confirmPassword) {
    res.status(400);
    throw new Error('Passwords do not match');
  }

  // Check if user already exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User with this email already exists');
  }

  // Check if company already exists
  let company = await Company.findOne({ name: companyName });
  if (!company) {
    // If company doesn't exist, create it. The first user becomes Admin.
    company = await Company.create({ name: companyName });
    await auditLogger(req, 'Company Created', 'Company', company._id, { companyName: company.name }); // NEW

  }

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email,
    password, // Mongoose pre-save hook will hash this
    companyId: company._id,
    role: 'Admin', // The first user for a new company is an Admin
    status: 'Active',
    joinedAt: Date.now(),
  });

  if (user) {
    await auditLogger(req, 'User Registered', 'User', user._id, { email: user.email, role: user.role }); // NEW

    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email }).select('+password'); // Explicitly select password field

  if (user && (await user.matchPassword(password))) {
        await auditLogger(req, 'User Logged In', 'Auth', user._id, { email: user.email, success: true }); // NEW

    // Update last login timestamp
    user.lastLoginAt = Date.now();
    await user.save(); // Save the updated user

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      companyId: user.companyId,
      role: user.role,
      token: generateToken(user._id),
    });
  } else {
        await auditLogger(req, 'Failed Login Attempt', 'Auth', null, { email: email, success: false, reason: 'Invalid Credentials' }); // NEW

    res.status(401);
    throw new Error('Invalid email or password');
  }
});

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = asyncHandler(async (req, res) => {
    if (req.user) {
        await auditLogger(req, 'User Logged Out', 'Auth', req.user._id, { email: req.user.email }); // NEW
    }
  // On the server side, logging out usually means just sending a success response
  // The client is responsible for deleting the JWT (from local storage, cookies, etc.)
  res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
};