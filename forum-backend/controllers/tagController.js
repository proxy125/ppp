const Tag = require('../models/Tag');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all tags
// @route   GET /api/tags
// @access  Public
const getTags = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const search = req.query.search || '';
  const sortBy = req.query.sortBy || 'usageCount'; // 'usageCount', 'name', 'createdAt'

  const startIndex = (page - 1) * limit;
  let query = { isActive: true };

  // Add search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { displayName: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = {};
  switch (sortBy) {
    case 'name':
      sortOption = { name: 1 };
      break;
    case 'createdAt':
      sortOption = { createdAt: -1 };
      break;
    default:
      sortOption = { usageCount: -1, createdAt: -1 };
  }

  const tags = await Tag.find(query)
    .populate('createdBy', 'name')
    .sort(sortOption)
    .limit(limit)
    .skip(startIndex);

  const total = await Tag.countDocuments(query);

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
    count: tags.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: tags
  });
});

// @desc    Get popular tags
// @route   GET /api/tags/popular
// @access  Public
const getPopularTags = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  
  const tags = await Tag.getPopularTags(limit);

  res.status(200).json({
    success: true,
    count: tags.length,
    data: tags
  });
});

// @desc    Create new tag
// @route   POST /api/tags
// @access  Private/Admin
const createTag = asyncHandler(async (req, res) => {
  const { name, displayName, description, color } = req.body;

  // Validation
  if (!name || !displayName) {
    return res.status(400).json({
      success: false,
      message: 'Please provide tag name and display name'
    });
  }

  // Check if tag already exists
  const existingTag = await Tag.findOne({ name: name.toLowerCase().trim() });
  if (existingTag) {
    return res.status(400).json({
      success: false,
      message: 'Tag with this name already exists'
    });
  }

  // Create tag
  const tag = await Tag.create({
    name: name.toLowerCase().trim(),
    displayName: displayName.trim(),
    description: description || '',
    color: color || '#3B82F6',
    createdBy: req.user._id
  });

  await tag.populate('createdBy', 'name');

  res.status(201).json({
    success: true,
    message: 'Tag created successfully',
    data: tag
  });
});

// @desc    Update tag
// @route   PUT /api/tags/:id
// @access  Private/Admin
const updateTag = asyncHandler(async (req, res) => {
  const { displayName, description, color, isActive } = req.body;

  const tag = await Tag.findById(req.params.id);

  if (!tag) {
    return res.status(404).json({
      success: false,
      message: 'Tag not found'
    });
  }

  // Update fields
  if (displayName) tag.displayName = displayName.trim();
  if (description !== undefined) tag.description = description;
  if (color) tag.color = color;
  if (isActive !== undefined) tag.isActive = isActive;

  await tag.save();

  res.status(200).json({
    success: true,
    message: 'Tag updated successfully',
    data: tag
  });
});

// @desc    Delete tag
// @route   DELETE /api/tags/:id
// @access  Private/Admin
const deleteTag = asyncHandler(async (req, res) => {
  const tag = await Tag.findById(req.params.id);

  if (!tag) {
    return res.status(404).json({
      success: false,
      message: 'Tag not found'
    });
  }

  // Soft delete
  tag.isActive = false;
  await tag.save();

  res.status(200).json({
    success: true,
    message: 'Tag deleted successfully'
  });
});

// @desc    Search tags
// @route   GET /api/tags/search
// @access  Public
const searchTags = asyncHandler(async (req, res) => {
  const { q: searchTerm } = req.query;
  const limit = parseInt(req.query.limit, 10) || 10;

  if (!searchTerm) {
    return res.status(400).json({
      success: false,
      message: 'Please provide search term'
    });
  }

  const tags = await Tag.searchTags(searchTerm, limit);

  res.status(200).json({
    success: true,
    count: tags.length,
    data: tags
  });
});

// @desc    Get tag details with posts
// @route   GET /api/tags/:name/posts
// @access  Public
const getTagWithPosts = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  const tag = await Tag.findOne({ name: name.toLowerCase() });

  if (!tag) {
    return res.status(404).json({
      success: false,
      message: 'Tag not found'
    });
  }

  const Post = require('../models/Post');
  const startIndex = (page - 1) * limit;

  const posts = await Post.find({
    tags: name.toLowerCase(),
    visibility: 'public',
    isActive: true
  })
  .populate('author', 'name profileImage')
  .select('-voters')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(startIndex);

  // Add comments count to each post
  for (let post of posts) {
    const Comment = require('../models/Comment');
    const commentsCount = await Comment.countDocuments({ 
      post: post._id, 
      isActive: true 
    });
    post.commentsCount = commentsCount;
  }

  const total = await Post.countDocuments({
    tags: name.toLowerCase(),
    visibility: 'public',
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
    data: {
      tag,
      posts,
      pagination: {
        ...pagination,
        totalPages,
        currentPage: page,
        total
      }
    }
  });
});

module.exports = {
  getTags,
  getPopularTags,
  createTag,
  updateTag,
  deleteTag,
  searchTags,
  getTagWithPosts
};