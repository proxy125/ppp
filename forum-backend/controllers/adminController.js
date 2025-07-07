const Comment = require('../models/Comment');
const User = require('../models/User');
const Post = require('../models/Post');
const Announcement = require('../models/Announcement');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get admin dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  // Get total counts
  const totalUsers = await User.countDocuments({ isActive: true });
  const totalPosts = await Post.countDocuments({ isActive: true });
  const totalComments = await Comment.countDocuments({ isActive: true });
  const totalAnnouncements = await Announcement.countDocuments({ isActive: true });

  // Get user stats by membership
  const bronzeUsers = await User.countDocuments({ 
    membership: 'bronze', 
    isActive: true 
  });
  const goldUsers = await User.countDocuments({ 
    membership: 'gold', 
    isActive: true 
  });

  // Get reported content counts
  const reportedComments = await Comment.countDocuments({ 
    isReported: true, 
    isActive: true 
  });
  const pendingReports = await Comment.aggregate([
    { $match: { isReported: true, isActive: true } },
    { $unwind: '$reports' },
    { $match: { 'reports.status': 'pending' } },
    { $count: 'total' }
  ]);

  // Get recent activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentUsers = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
    isActive: true
  });

  const recentPosts = await Post.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
    isActive: true
  });

  const recentComments = await Comment.countDocuments({
    createdAt: { $gte: thirtyDaysAgo },
    isActive: true
  });

  // Get chart data for the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const chartData = await Promise.all([
    User.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]),
    Post.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]),
    Comment.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          isActive: true
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ])
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalStats: {
        totalUsers,
        totalPosts,
        totalComments,
        totalAnnouncements
      },
      membershipStats: {
        bronzeUsers,
        goldUsers
      },
      reportsStats: {
        reportedComments,
        pendingReports: pendingReports[0]?.total || 0
      },
      recentActivity: {
        recentUsers,
        recentPosts,
        recentComments
      },
      chartData: {
        users: chartData[0],
        posts: chartData[1],
        comments: chartData[2]
      }
    }
  });
});

// @desc    Get all reported comments
// @route   GET /api/admin/reported-comments
// @access  Private/Admin
const getReportedComments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const status = req.query.status || 'all'; // 'all', 'pending', 'reviewed', 'resolved'

  const startIndex = (page - 1) * limit;
  let matchQuery = { isReported: true, isActive: true };

  // Filter by report status if specified
  if (status !== 'all') {
    matchQuery['reports.status'] = status;
  }

  const reportedComments = await Comment.find(matchQuery)
    .populate('author', 'name email profileImage')
    .populate('post', 'title')
    .populate('reports.reportedBy', 'name email')
    .sort({ 'reports.reportedAt': -1 })
    .limit(limit)
    .skip(startIndex);

  const total = await Comment.countDocuments(matchQuery);

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
    count: reportedComments.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: reportedComments
  });
});

// @desc    Handle reported comment (approve, flag, remove)
// @route   PUT /api/admin/reported-comments/:id/action
// @access  Private/Admin
const handleReportedComment = asyncHandler(async (req, res) => {
  const { action, reportId, reason } = req.body;
  // action: 'approve', 'flag', 'remove'
  // reportId: specific report to update
  // reason: optional reason for the action

  if (!action || !['approve', 'flag', 'remove'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide valid action (approve, flag, remove)'
    });
  }

  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    return res.status(404).json({
      success: false,
      message: 'Comment not found'
    });
  }

  let moderationStatus = 'approved';
  let reportStatus = 'resolved';

  switch (action) {
    case 'approve':
      moderationStatus = 'approved';
      reportStatus = 'dismissed';
      break;
    case 'flag':
      moderationStatus = 'flagged';
      reportStatus = 'reviewed';
      break;
    case 'remove':
      moderationStatus = 'removed';
      reportStatus = 'resolved';
      break;
  }

  // Update comment moderation status
  await comment.moderate(moderationStatus, req.user._id);

  // Update specific report status if reportId provided
  if (reportId) {
    await comment.updateReportStatus(reportId, reportStatus);
  } else {
    // Update all pending reports
    comment.reports.forEach(report => {
      if (report.status === 'pending') {
        report.status = reportStatus;
      }
    });
    await comment.save();
  }

  // Log the admin action (you could create an AdminAction model for this)
  console.log(`Admin ${req.user.name} took action "${action}" on comment ${comment._id}`);

  res.status(200).json({
    success: true,
    message: `Comment ${action}ed successfully`,
    data: comment
  });
});

// @desc    Get admin profile with additional stats
// @route   GET /api/admin/profile
// @access  Private/Admin
const getAdminProfile = asyncHandler(async (req, res) => {
  // Get admin user data
  const admin = await User.findById(req.user._id)
    .populate('postsCount')
    .populate('commentsCount');

  // Get admin-specific stats
  const totalUsers = await User.countDocuments({ isActive: true });
  const totalPosts = await Post.countDocuments({ isActive: true });
  const totalComments = await Comment.countDocuments({ isActive: true });

  // Get data for pie chart
  const pieChartData = {
    users: totalUsers,
    posts: totalPosts,
    comments: totalComments
  };

  res.status(200).json({
    success: true,
    data: {
      admin,
      stats: {
        totalUsers,
        totalPosts,
        totalComments
      },
      pieChartData
    }
  });
});

// @desc    Get system overview for admin
// @route   GET /api/admin/system-overview
// @access  Private/Admin
const getSystemOverview = asyncHandler(async (req, res) => {
  // Database stats
  const dbStats = {
    users: await User.countDocuments(),
    activeUsers: await User.countDocuments({ isActive: true }),
    posts: await Post.countDocuments(),
    activePosts: await Post.countDocuments({ isActive: true }),
    comments: await Comment.countDocuments(),
    activeComments: await Comment.countDocuments({ isActive: true }),
    announcements: await Announcement.countDocuments(),
    activeAnnouncements: await Announcement.countDocuments({ isActive: true })
  };

  // Content moderation stats
  const moderationStats = {
    reportedComments: await Comment.countDocuments({ isReported: true }),
    pendingReports: await Comment.aggregate([
      { $match: { isReported: true } },
      { $unwind: '$reports' },
      { $match: { 'reports.status': 'pending' } },
      { $count: 'total' }
    ]).then(result => result[0]?.total || 0),
    flaggedComments: await Comment.countDocuments({ moderationStatus: 'flagged' }),
    removedComments: await Comment.countDocuments({ moderationStatus: 'removed' })
  };

  // User engagement stats
  const engagementStats = await Post.aggregate([
    {
      $group: {
        _id: null,
        totalUpVotes: { $sum: '$upVote' },
        totalDownVotes: { $sum: '$downVote' },
        totalViews: { $sum: '$views' },
        averageVotes: { $avg: { $add: ['$upVote', '$downVote'] } }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    data: {
      dbStats,
      moderationStats,
      engagementStats: engagementStats[0] || {
        totalUpVotes: 0,
        totalDownVotes: 0,
        totalViews: 0,
        averageVotes: 0
      }
    }
  });
});

// @desc    Bulk action on reported comments
// @route   POST /api/admin/reported-comments/bulk-action
// @access  Private/Admin
const bulkActionReportedComments = asyncHandler(async (req, res) => {
  const { commentIds, action } = req.body;
  // action: 'approve', 'flag', 'remove'

  if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an array of comment IDs'
    });
  }

  if (!action || !['approve', 'flag', 'remove'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide valid action (approve, flag, remove)'
    });
  }

  let moderationStatus = 'approved';
  let reportStatus = 'resolved';

  switch (action) {
    case 'approve':
      moderationStatus = 'approved';
      reportStatus = 'dismissed';
      break;
    case 'flag':
      moderationStatus = 'flagged';
      reportStatus = 'reviewed';
      break;
    case 'remove':
      moderationStatus = 'removed';
      reportStatus = 'resolved';
      break;
  }

  // Update comments
  const updateResult = await Comment.updateMany(
    { _id: { $in: commentIds } },
    { 
      moderationStatus,
      'reports.$[].status': reportStatus
    }
  );

  res.status(200).json({
    success: true,
    message: `Bulk action completed. ${updateResult.modifiedCount} comments processed.`,
    data: {
      action,
      processedCount: updateResult.modifiedCount,
      totalRequested: commentIds.length
    }
  });
});

module.exports = {
  getDashboardStats,
  getReportedComments,
  handleReportedComment,
  getAdminProfile,
  getSystemOverview,
  bulkActionReportedComments
};