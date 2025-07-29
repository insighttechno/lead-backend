const express = require('express');
const {
  getUserProfile,
  updateUserProfile,
  changePassword,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
} = require('../controllers/userController');
const { protect, authorize, checkCompanyOwnership } = require('../middleware/authMiddleware');
const mongoose = require('mongoose'); // Needed for dynamic model lookup in checkCompanyOwnership

const router = express.Router();

// User Profile Routes
router.route('/me')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

router.put('/me/change-password', protect, changePassword);

// Team Management Routes
// Middleware to set the model name for checkCompanyOwnership
router.param('id', (req, res, next, id) => {
    // For team member specific operations, we're checking against the User model
    req.resourceModel = 'User';
    next();
});

router.route('/')
  .get(protect, authorize('Admin', 'Team Lead'), getTeamMembers)
  .post(protect, authorize('Admin', 'Team Lead'), addTeamMember);

router.route('/:id')
  .put(protect, authorize('Admin', 'Team Lead'), checkCompanyOwnership, updateTeamMember)
  .delete(protect, authorize('Admin'), checkCompanyOwnership, deleteTeamMember); // Only Admin can delete

module.exports = router;