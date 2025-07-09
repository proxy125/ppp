const Comment = require('../models/Comment');
const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get comments for a post
// @route   GET /api/comments/post/:postId
// @access  Public
const getCommentsByPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  const comments = await Comment.getCommentsByPost(postId, limit, (page - 1) * limit);
  const total = await Comment.countDocuments({ 
    post: postId, 
    isActive: true, 
    moderationStatus: { $in: ['approved', 'pending'] }
  });

  // Pagination
  const pagination = {};
  const totalPages = Math.ceil(total / limit);

  if (page < totalPages) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (page > 1) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: comments.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: comments
  });
});

// @desc    Create new comment
// @route   POST /api/comments
// @access  Private
const createComment = asyncHandler(async (req, res) => {
  const { postId, content } = req.body;

  // Validation
  if (!postId || !content) {
    return res.status(400).json({
      success: false,
      message: 'Please provide post ID and content'
    });
  }

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  if (post.visibility === 'private' && post.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Cannot comment on private post'
    });
  }

  // Create comment
  const comment = await Comment.create({
    post: postId,
    postTitle: post.title,
    content,
    author: req.user._id,
    authorName: req.user.name,
    authorEmail: req.user.email
  });

  await comment.populate('author', 'name profileImage');

  res.status(201).json({
    success: true,
    message: 'Comment created successfully',
    data: comment
  });
});

// @desc    Update comment
// @route   PUT /api/comments/:id
// @access  Private (Owner or Admin)
const updateComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Please provide content'
    });
  }

  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    return res.status(404).json({
      success: false,
      message: 'Comment not found'
    });
  }

  // Check ownership
  if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this comment'
    });
  }

  comment.content = content;
  await comment.save();

  res.status(200).json({
    success: true,
    message: 'Comment updated successfully',
    data: comment
  });
});

// @desc    Delete comment
// @route   DELETE /api/comments/:id
// @access  Private (Owner or Admin)
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    return res.status(404).json({
      success: false,
      message: 'Comment not found'
    });
  }

  // Check ownership
  if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this comment'
    });
  }

  // Soft delete
  comment.isActive = false;
  await comment.save();

  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully'
  });
});

// @desc    Report comment
// @route   POST /api/comments/:id/report
// @access  Private
const reportComment = asyncHandler(async (req, res) => {
  const { feedback } = req.body;

  if (!feedback) {
    return res.status(400).json({
      success: false,
      message: 'Please provide feedback for the report'
    });
  }

  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    return res.status(404).json({
      success: false,
      message: 'Comment not found'
    });
  }

  if (!comment.isActive) {
    return res.status(400).json({
      success: false,
      message: 'Cannot report an inactive comment'
    });
  }

  try {
    await comment.addReport(req.user._id, feedback);

    res.status(200).json({
      success: true,
      message: 'Comment reported successfully'
    });
  } catch (error) {
    if (error.message === 'You have already reported this comment') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    throw error;
  }
});

// @desc    Get comments for a post (for post owner to manage)
// @route   GET /api/comments/manage/:postId
// @access  Private
const getCommentsToManage = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  // Check if post exists and user owns it
  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to manage comments for this post'
    });
  }

  const startIndex = (page - 1) * limit;

  const comments = await Comment.find({ 
    post: postId, 
    isActive: true 
  })
  .populate('author', 'name email profileImage')
  .populate('reports.reportedBy', 'name email')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(startIndex);

  const total = await Comment.countDocuments({ 
    post: postId, 
    isActive: true 
  });

  // Pagination
  const pagination = {};
  const totalPages = Math.ceil(total / limit);

  if (page < totalPages) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (page > 1) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: comments.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: comments
  });
});

// @desc    Get user's comments
// @route   GET /api/comments/my-comments
// @access  Private
const getMyComments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  const comments = await Comment.find({ 
    author: req.user._id, 
    isActive: true 
  })
  .populate('post', 'title')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(startIndex);

  const total = await Comment.countDocuments({ 
    author: req.user._id, 
    isActive: true 
  });

  // Pagination
  const pagination = {};
  const totalPages = Math.ceil(total / limit);

  if (page < totalPages) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (page > 1) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: comments.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: comments
  });
});

module.exports = {
  getCommentsByPost,
  createComment,
  updateComment,
  deleteComment,
  reportComment,
  getCommentsToManage,
  getMyComments
};