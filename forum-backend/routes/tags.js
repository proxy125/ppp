const express = require('express');
const {
  getTags,
  getPopularTags,
  createTag,
  updateTag,
  deleteTag,
  searchTags,
  getTagWithPosts
} = require('../controllers/tagController');

const { protect, admin } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', getTags);
router.get('/popular', getPopularTags);
router.get('/search', searchTags);
router.get('/:name/posts', getTagWithPosts);

// Admin only routes
router.post('/', protect, admin, createTag);
router.put('/:id', protect, admin, updateTag);
router.delete('/:id', protect, admin, deleteTag);

module.exports = router;