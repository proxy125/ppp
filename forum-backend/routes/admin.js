const express = require('express');
const {
  getDashboardStats,
  getReportedComments,
  handleReportedComment,
  getAdminProfile,
  getSystemOverview,
  bulkActionReportedComments
} = require('../controllers/adminController');

const { protect, admin } = require('../middleware/auth');

const router = express.Router();

// All routes are admin-only
router.use(protect, admin);

router.get('/dashboard', getDashboardStats);
router.get('/profile', getAdminProfile);
router.get('/system-overview', getSystemOverview);
router.get('/reported-comments', getReportedComments);
router.put('/reported-comments/:id/action', handleReportedComment);
router.post('/reported-comments/bulk-action', bulkActionReportedComments);

module.exports = router;