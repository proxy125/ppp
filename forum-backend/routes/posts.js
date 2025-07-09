const express = require('express');
const {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  votePost,
  searchPosts,
  getMyPosts,
  getPopularSearches
} = require('../controllers/postController');

const { protect, optionalAuth, checkPostOwnership } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', optionalAuth, getPosts);
router.get('/search', optionalAuth, searchPosts);
router.get('/popular-searches', getPopularSearches);
router.get('/:id', optionalAuth, getPost);

// Protected routes
router.post('/', protect, createPost);
router.get('/user/my-posts', protect, getMyPosts);
router.put('/:id', protect, checkPostOwnership, updatePost);
router.delete('/:id', protect, checkPostOwnership, deletePost);
router.post('/:id/vote', protect, votePost);

module.exports = router;