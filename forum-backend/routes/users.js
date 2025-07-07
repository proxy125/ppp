const express = require('express');
const {
  getUserProfile,
  upgradeMembership,
  getUsers,
  makeAdmin,
  removeAdmin,
  deactivateUser,
  reactivateUser,
  getUserStats
} = require('../controllers/userController');

const { protect, admin } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/:id', getUserProfile);

// Protected routes
router.post('/upgrade-membership', protect, upgradeMembership);

// Admin only routes
router.get('/', protect, admin, getUsers);
router.get('/admin/stats', protect, admin, getUserStats);
router.put('/:id/make-admin', protect, admin, makeAdmin);
router.put('/:id/remove-admin', protect, admin, removeAdmin);
router.put('/:id/deactivate', protect, admin, deactivateUser);
router.put('/:id/reactivate', protect, admin, reactivateUser);

module.exports = router;