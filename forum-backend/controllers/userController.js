const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get user profile
// @route   GET /api/users/:id
// @access  Public
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('postsCount')
    .populate('commentsCount');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (!user.isActive) {
    return res.status(404).json({
      success: false,
      message: 'User account is deactivated'
    });
  }

  // Get user's recent posts (3 most recent)
  const recentPosts = await Post.find({ 
    author: user._id, 
    isActive: true,
    visibility: 'public'
  })
  .select('title createdAt upVote downVote tags')
  .sort({ createdAt: -1 })
  .limit(3);

  res.status(200).json({
    success: true,
    data: {
      user,
      recentPosts
    }
  });
});

// @desc    Upgrade to gold membership
// @route   POST /api/users/upgrade-membership
// @access  Private
const upgradeMembership = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user.membership === 'gold') {
    return res.status(400).json({
      success: false,
      message: 'User already has gold membership'
    });
  }

  // In a real application, you would process payment here
  // For this demo, we'll just upgrade the user
  user.upgradeToGold();
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Successfully upgraded to Gold membership!',
    data: user
  });
});

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || '';
  
  const startIndex = (page - 1) * limit;

  let query = { isActive: true };

  // Add search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .select('-password')
    .populate('postsCount')
    .populate('commentsCount')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(startIndex);

  const total = await User.countDocuments(query);

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
    count: users.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: users
  });
});

// @desc    Make user admin
// @route   PUT /api/users/:id/make-admin
// @access  Private/Admin
const makeAdmin = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.role === 'admin') {
    return res.status(400).json({
      success: false,
      message: 'User is already an admin'
    });
  }

  user.role = 'admin';
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User promoted to admin successfully',
    data: user
  });
});

// @desc    Remove admin role
// @route   PUT /api/users/:id/remove-admin
// @access  Private/Admin
const removeAdmin = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.role !== 'admin') {
    return res.status(400).json({
      success: false,
      message: 'User is not an admin'
    });
  }

  // Prevent removing admin role from current user
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot remove admin role from yourself'
    });
  }

  user.role = 'user';
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Admin role removed successfully',
    data: user
  });
});

// @desc    Deactivate user
// @route   PUT /api/users/:id/deactivate
// @access  Private/Admin
const deactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (!user.isActive) {
    return res.status(400).json({
      success: false,
      message: 'User is already deactivated'
    });
  }

  // Prevent deactivating current user
  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({
      success: false,
      message: 'Cannot deactivate yourself'
    });
  }

  user.isActive = false;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User deactivated successfully',
    data: user
  });
});

// @desc    Reactivate user
// @route   PUT /api/users/:id/reactivate
// @access  Private/Admin
const reactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.isActive) {
    return res.status(400).json({
      success: false,
      message: 'User is already active'
    });
  }

  user.isActive = true;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User reactivated successfully',
    data: user
  });
});

// @desc    Get user statistics (Admin only)
// @route   GET /api/users/stats
// @access  Private/Admin
const getUserStats = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments({ isActive: true });
  const totalAdmins = await User.countDocuments({ role: 'admin', isActive: true });
  const totalGoldMembers = await User.countDocuments({ 
    membership: 'gold', 
    isActive: true 
  });
  const totalPosts = await Post.countDocuments({ isActive: true });
  const totalComments = await Comment.countDocuments({ isActive: true });

  // Get user registrations by month (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const userRegistrations = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: sixMonthsAgo },
        isActive: true
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalAdmins,
      totalGoldMembers,
      totalPosts,
      totalComments,
      userRegistrations
    }
  });
});

module.exports = {
  getUserProfile,
  upgradeMembership,
  getUsers,
  makeAdmin,
  removeAdmin,
  deactivateUser,
  reactivateUser,
  getUserStats
};