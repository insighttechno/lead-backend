const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken'); // Needed if creating new users with auto-generated passwords
const nodemailer = require('nodemailer'); // For sending temporary password/welcome email

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password'); // Exclude password

  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/users/me
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.email = req.body.email || user.email; // Add email validation if it's unique
    user.profilePictureUrl = req.body.profilePictureUrl || user.profilePictureUrl;
    user.is2FAEnabled = req.body.is2FAEnabled !== undefined ? req.body.is2FAEnabled : user.is2FAEnabled;

    const updatedUser = await user.save(); // Pre-save hook will handle password hashing if it's updated

    res.json({
      message: 'Profile updated',
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      profilePictureUrl: updatedUser.profilePictureUrl,
      is2FAEnabled: updatedUser.is2FAEnabled,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Change user password
// @route   PUT /api/users/me/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password'); // Select password to compare

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (!(await user.matchPassword(currentPassword))) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  if (newPassword !== confirmNewPassword) {
    res.status(400);
    throw new Error('New passwords do not match');
  }

  // Basic password strength check (can be enhanced)
  if (newPassword.length < 6) {
    res.status(400);
    throw new Error('New password must be at least 6 characters long');
  }

  user.password = newPassword; // Mongoose pre-save hook will hash this
  await user.save();

  res.json({ message: 'Password changed successfully' });
});


// --- Team Management Functions ---

// @desc    Get all team members for the company
// @route   GET /api/teams
// @access  Private (Admin, Lead Generation Specialist)
const getTeamMembers = asyncHandler(async (req, res) => {
  const { search, status, role, page = 1, limit = 10 } = req.query;

  const query = { companyId: req.companyId };
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  if (status) {
    query.status = status;
  }
  if (role) {
    query.role = role;
  }

  const users = await User.find(query)
    .select('-password') // Exclude passwords from team member list
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ joinedAt: -1 }); // Sort by most recently joined

  const count = await User.countDocuments(query);

  res.json({
    members: users,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    totalMembers: count,
  });
});

// @desc    Add a new team member
// @route   POST /api/teams
// @access  Private (Admin, Lead Generation Specialist)
const addTeamMember = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, role, department, password } = req.body;

  if (!firstName || !lastName || !email || !role) {
    res.status(400);
    throw new Error('Please enter first name, last name, email, and role');
  }

  if (!['Lead Generation Specialist'].includes(role)) {
    res.status(400);
    throw new Error('Invalid role specified');
  }

  const userExists = await User.findOne({ email, companyId: req.companyId });
  if (userExists) {
    res.status(400);
    throw new Error('A user with this email already exists in your company');
  }

  const newUser = await User.create({
    firstName,
    lastName,
    email,
    password,
    companyId: req.companyId,
    role,
    department,
    status: 'Pending', // User needs to set their password
    joinedAt: Date.now(),
  });

  if (newUser) {
    // In a real application, you would send an email with a password reset link
    // or instructions to set their password using the temporary one.
    // For now, let's just log it.
    console.log(`New user "${newUser.email}" added. Temporary password: ${password}`);
    // You could use Nodemailer here to send an invite email:
    // const transporter = nodemailer.createTransport(company.smtpConfig); // Use company's SMTP
    // await transporter.sendMail({ from: 'no-reply@leadigniter.com', to: newUser.email, subject: 'Welcome to LeadIgniter!', html: `<p>Your temporary password is: ${tempPassword}. Please login and change it.</p>` });


    res.status(201).json({
      message: 'Team member added successfully. User should set their password.',
      member: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        status: newUser.status,
      },
    });
  } else {
    res.status(400);
    throw new Error('Invalid team member data');
  }
});

// @desc    Update a team member's details
// @route   PUT /api/teams/:id
// @access  Private (Admin, Lead Generation Specialist)
const updateTeamMember = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware for the User model
  const user = req.resource;
  const { firstName, lastName, email, role, department, status } = req.body;

  // Prevent updating own role or status for self (Admin should do that)
  if (user._id.toString() === req.user._id.toString() && (role || status)) {
      res.status(403);
      throw new Error('You cannot modify your own role or status.');
  }

  // Only allow Admin to set other users' roles to Admin
  if (req.user.role !== 'Admin' && role === 'Admin' && user.role !== 'Admin') {
      res.status(403);
      throw new Error('Only an Admin can assign the Admin role.');
  }


  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (email) user.email = email; // Add email validation and unique check here
  if (role) user.role = role;
  if (department) user.department = department;
  if (status) user.status = status;

  const updatedUser = await user.save();
  res.json({
    message: 'Team member updated',
    member: {
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.role,
      department: updatedUser.department,
      status: updatedUser.status,
    },
  });
});

// @desc    Delete a team member
// @route   DELETE /api/teams/:id
// @access  Private (Admin)
const deleteTeamMember = asyncHandler(async (req, res) => {
  // req.resource is attached by checkCompanyOwnership middleware for the User model
  const user = req.resource;

  if (user._id.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot delete your own account via this endpoint.');
  }

  // Optionally, check if user has active campaigns or resources before deleting
  // const userCampaigns = await Campaign.countDocuments({ createdBy: user._id });
  // if (userCampaigns > 0) {
  //   res.status(400);
  //   throw new Error('Cannot delete user with active campaigns. Reassign or delete campaigns first.');
  // }

  await user.deleteOne();
  res.json({ message: 'Team member removed successfully' });
});

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
};