const express = require('express');
const {
  getCommentsByPost,
  createComment,
  updateComment,
  deleteComment,
  reportComment,
  getCommentsToManage,
  getMyComments
} = require('../controllers/commentController');

const { protect, checkCommentOwnership } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/post/:postId', getCommentsByPost);

// Protected routes
router.post('/', protect, createComment);
router.get('/my-comments', protect, getMyComments);
router.get('/manage/:postId', protect, getCommentsToManage);
router.put('/:id', protect, checkCommentOwnership, updateComment);
router.delete('/:id', protect, checkCommentOwnership, deleteComment);
router.post('/:id/report', protect, reportComment);

module.exports = router;