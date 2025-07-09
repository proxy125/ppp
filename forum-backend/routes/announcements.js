const express = require('express');
const {
  getAnnouncements,
  getAnnouncementCount,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePin,
  getAllAnnouncementsAdmin
} = require('../controllers/announcementController');

const { protect, admin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', optionalAuth, getAnnouncements);
router.get('/count', optionalAuth, getAnnouncementCount);
router.get('/:id', optionalAuth, getAnnouncement);

// Admin only routes
router.post('/', protect, admin, createAnnouncement);
router.put('/:id', protect, admin, updateAnnouncement);
router.delete('/:id', protect, admin, deleteAnnouncement);
router.put('/:id/toggle-pin', protect, admin, togglePin);
router.get('/admin/all', protect, admin, getAllAnnouncementsAdmin);

module.exports = router;