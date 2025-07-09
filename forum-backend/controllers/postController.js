const Post = require('../models/Post');
const Tag = require('../models/Tag');
const Search = require('../models/Search');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all posts with pagination and sorting
// @route   GET /api/posts
// @access  Public
const getPosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 5;
  const sortBy = req.query.sortBy || 'createdAt'; // 'createdAt' or 'popularity'
  const startIndex = (page - 1) * limit;

  let query = {
    visibility: 'public',
    isActive: true
  };

  let posts;
  let total;

  if (sortBy === 'popularity') {
    // Use aggregation for popularity sorting
    const aggregationPipeline = [
      { $match: query },
      {
        $addFields: {
          voteDifference: { $subtract: ['$upVote', '$downVote'] }
        }
      },
      { $sort: { voteDifference: -1, createdAt: -1 } },
      { $skip: startIndex },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorData'
        }
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          as: 'comments'
        }
      },
      {
        $addFields: {
          commentsCount: { $size: '$comments' }
        }
      },
      {
        $project: {
          comments: 0,
          voters: 0
        }
      }
    ];

    posts = await Post.aggregate(aggregationPipeline);
    total = await Post.countDocuments(query);
  } else {
    // Regular sorting by creation date
    posts = await Post.find(query)
      .populate('author', 'name profileImage')
      .select('-voters')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(startIndex);

    // Get comments count for each post
    for (let post of posts) {
      const Comment = require('../models/Comment');
      const commentsCount = await Comment.countDocuments({ 
        post: post._id, 
        isActive: true 
      });
      post.commentsCount = commentsCount;
    }

    total = await Post.countDocuments(query);
  }

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
    count: posts.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: posts
  });
});

// @desc    Get single post
// @route   GET /api/posts/:id
// @access  Public
const getPost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id)
    .populate('author', 'name profileImage email')
    .populate('commentsCount');

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  if (post.visibility === 'private' && (!req.user || post.author._id.toString() !== req.user._id.toString())) {
    return res.status(403).json({
      success: false,
      message: 'Post is private'
    });
  }

  // Increment views
  await post.incrementViews();

  // Check if current user has voted (if authenticated)
  let userVote = null;
  if (req.user) {
    userVote = post.getUserVote(req.user._id);
  }

  const postData = post.toObject();
  postData.userVote = userVote;
  delete postData.voters; // Remove voters array from response

  res.status(200).json({
    success: true,
    data: postData
  });
});

// @desc    Create new post
// @route   POST /api/posts
// @access  Private
const createPost = asyncHandler(async (req, res) => {
  const { title, description, tags } = req.body;

  // Validation
  if (!title || !description || !tags || tags.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide title, description, and at least one tag'
    });
  }

  // Check post limit for non-gold members
  const postCount = await Post.countDocuments({ 
    author: req.user._id, 
    isActive: true 
  });

  if (!req.user.hasMembership() && postCount >= 5) {
    return res.status(403).json({
      success: false,
      message: 'Post limit reached. Upgrade to Gold membership for unlimited posts.',
      postLimit: true
    });
  }

  // Normalize tags
  const normalizedTags = tags.map(tag => tag.toLowerCase().trim());

  // Create post
  const post = await Post.create({
    title,
    description,
    tags: normalizedTags,
    author: req.user._id,
    authorName: req.user.name,
    authorEmail: req.user.email,
    authorImage: req.user.profileImage
  });

  // Update tag usage counts
  for (const tagName of normalizedTags) {
    try {
      const tag = await Tag.findOne({ name: tagName });
      if (tag) {
        await tag.incrementUsage();
      }
    } catch (error) {
      console.error('Error updating tag usage:', error);
    }
  }

  await post.populate('author', 'name profileImage');

  res.status(201).json({
    success: true,
    message: 'Post created successfully',
    data: post
  });
});

// @desc    Update post
// @route   PUT /api/posts/:id
// @access  Private (Owner or Admin)
const updatePost = asyncHandler(async (req, res) => {
  const { title, description, tags, visibility } = req.body;

  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // Check ownership
  if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this post'
    });
  }

  // Update fields
  if (title) post.title = title;
  if (description) post.description = description;
  if (visibility) post.visibility = visibility;
  
  if (tags && tags.length > 0) {
    const normalizedTags = tags.map(tag => tag.toLowerCase().trim());
    post.tags = normalizedTags;
    
    // Update tag usage counts
    for (const tagName of normalizedTags) {
      try {
        const tag = await Tag.findOne({ name: tagName });
        if (tag) {
          await tag.incrementUsage();
        }
      } catch (error) {
        console.error('Error updating tag usage:', error);
      }
    }
  }

  await post.save();

  res.status(200).json({
    success: true,
    message: 'Post updated successfully',
    data: post
  });
});

// @desc    Delete post
// @route   DELETE /api/posts/:id
// @access  Private (Owner or Admin)
const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // Check ownership
  if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this post'
    });
  }

  // Soft delete
  post.isActive = false;
  await post.save();

  res.status(200).json({
    success: true,
    message: 'Post deleted successfully'
  });
});

// @desc    Vote on post (upvote/downvote)
// @route   POST /api/posts/:id/vote
// @access  Private
const votePost = asyncHandler(async (req, res) => {
  const { voteType } = req.body; // 'up' or 'down'

  if (!voteType || !['up', 'down'].includes(voteType)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide valid vote type (up or down)'
    });
  }

  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  if (post.visibility === 'private' && post.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Cannot vote on private post'
    });
  }

  // Check if user has already voted
  const existingVote = post.getUserVote(req.user._id);
  
  if (existingVote === voteType) {
    // Remove vote if clicking the same vote type
    await post.removeVote(req.user._id);
    
    return res.status(200).json({
      success: true,
      message: `${voteType === 'up' ? 'Upvote' : 'Downvote'} removed`,
      data: {
        upVote: post.upVote,
        downVote: post.downVote,
        voteDifference: post.voteDifference,
        userVote: null
      }
    });
  } else {
    // Add new vote (this will remove existing vote if any)
    await post.vote(req.user._id, voteType);
    
    return res.status(200).json({
      success: true,
      message: `${voteType === 'up' ? 'Upvoted' : 'Downvoted'} successfully`,
      data: {
        upVote: post.upVote,
        downVote: post.downVote,
        voteDifference: post.voteDifference,
        userVote: voteType
      }
    });
  }
});

// @desc    Search posts
// @route   GET /api/posts/search
// @access  Public
const searchPosts = asyncHandler(async (req, res) => {
  const { q: searchTerm, tags, page = 1, limit = 10 } = req.query;

  if (!searchTerm && !tags) {
    return res.status(400).json({
      success: false,
      message: 'Please provide search term or tags'
    });
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  let query = {
    visibility: 'public',
    isActive: true
  };

  let posts;
  let total;

  if (tags) {
    // Search by tags
    const tagArray = Array.isArray(tags) ? tags : tags.split(',');
    const normalizedTags = tagArray.map(tag => tag.toLowerCase().trim());
    
    query.tags = { $in: normalizedTags };
    
    posts = await Post.find(query)
      .populate('author', 'name profileImage')
      .select('-voters')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    total = await Post.countDocuments(query);

    // Record search
    if (searchTerm) {
      await Search.recordSearch(searchTerm, req.user?._id, total);
    }
  } else if (searchTerm) {
    // Text search in title and description
    posts = await Post.find({
      ...query,
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { tags: { $regex: searchTerm, $options: 'i' } }
      ]
    })
    .populate('author', 'name profileImage')
    .select('-voters')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(skip);

    total = await Post.countDocuments({
      ...query,
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { tags: { $regex: searchTerm, $options: 'i' } }
      ]
    });

    // Record search
    await Search.recordSearch(searchTerm, req.user?._id, total);
  }

  // Add comments count to each post
  for (let post of posts) {
    const Comment = require('../models/Comment');
    const commentsCount = await Comment.countDocuments({ 
      post: post._id, 
      isActive: true 
    });
    post.commentsCount = commentsCount;
  }

  // Pagination
  const totalPages = Math.ceil(total / parseInt(limit));
  const pagination = {};

  if (parseInt(page) < totalPages) {
    pagination.next = {
      page: parseInt(page) + 1,
      limit: parseInt(limit)
    };
  }

  if (parseInt(page) > 1) {
    pagination.prev = {
      page: parseInt(page) - 1,
      limit: parseInt(limit)
    };
  }

  res.status(200).json({
    success: true,
    count: posts.length,
    pagination,
    totalPages,
    currentPage: parseInt(page),
    total,
    searchTerm,
    data: posts
  });
});

// @desc    Get user's posts
// @route   GET /api/posts/my-posts
// @access  Private
const getMyPosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;

  const query = {
    author: req.user._id,
    isActive: true
  };

  const posts = await Post.find(query)
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

  const total = await Post.countDocuments(query);

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
    count: posts.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: posts
  });
});

// @desc    Get popular searches
// @route   GET /api/posts/popular-searches
// @access  Public
const getPopularSearches = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 3;
  
  const popularSearches = await Search.getPopularSearches(limit);

  res.status(200).json({
    success: true,
    data: popularSearches
  });
});

module.exports = {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  votePost,
  searchPosts,
  getMyPosts,
  getPopularSearches
};