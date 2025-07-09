const express = require('express');
const {
  register,
  login,
  socialAuth,
  getMe,
  updateProfile,
  updatePassword,
  logout,
  deactivateAccount,
  canPost
} = require('../controllers/authController');

const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/social', socialAuth);
router.post('/logout', logout);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, updatePassword);
router.delete('/deactivate', protect, deactivateAccount);
router.get('/can-post', protect, canPost);

module.exports = router;