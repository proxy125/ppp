const Announcement = require('../models/Announcement');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Public
const getAnnouncements = asyncHandler(async (req, res) => {
  const targetAudience = req.user ? 
    (req.user.membership === 'gold' ? 'members' : 'all') : 'all';

  const announcements = await Announcement.getCurrentAnnouncements(targetAudience);

  res.status(200).json({
    success: true,
    count: announcements.length,
    data: announcements
  });
});

// @desc    Get announcement count
// @route   GET /api/announcements/count
// @access  Public
const getAnnouncementCount = asyncHandler(async (req, res) => {
  const targetAudience = req.user ? 
    (req.user.membership === 'gold' ? 'members' : 'all') : 'all';

  const count = await Announcement.getAnnouncementCount(targetAudience);

  res.status(200).json({
    success: true,
    data: { count }
  });
});

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Public
const getAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('author', 'name profileImage');

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Announcement not found'
    });
  }

  if (!announcement.isCurrent) {
    return res.status(404).json({
      success: false,
      message: 'Announcement is not active or has expired'
    });
  }

  // Check target audience
  if (announcement.targetAudience === 'members' && 
      (!req.user || req.user.membership !== 'gold')) {
    return res.status(403).json({
      success: false,
      message: 'This announcement is for members only'
    });
  }

  if (announcement.targetAudience === 'admins' && 
      (!req.user || req.user.role !== 'admin')) {
    return res.status(403).json({
      success: false,
      message: 'This announcement is for admins only'
    });
  }

  // Increment views
  await announcement.incrementViews();

  res.status(200).json({
    success: true,
    data: announcement
  });
});

// @desc    Create new announcement (Admin only)
// @route   POST /api/announcements
// @access  Private/Admin
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, description, priority, type, targetAudience, expiresAt } = req.body;

  // Validation
  if (!title || !description) {
    return res.status(400).json({
      success: false,
      message: 'Please provide title and description'
    });
  }

  // Create announcement
  const announcement = await Announcement.create({
    title,
    description,
    priority: priority || 'medium',
    type: type || 'general',
    targetAudience: targetAudience || 'all',
    expiresAt: expiresAt || null,
    author: req.user._id,
    authorName: req.user.name,
    authorImage: req.user.profileImage
  });

  await announcement.populate('author', 'name profileImage');

  res.status(201).json({
    success: true,
    message: 'Announcement created successfully',
    data: announcement
  });
});

// @desc    Update announcement (Admin only)
// @route   PUT /api/announcements/:id
// @access  Private/Admin
const updateAnnouncement = asyncHandler(async (req, res) => {
  const { title, description, priority, type, targetAudience, expiresAt, isActive, isPinned } = req.body;

  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Announcement not found'
    });
  }

  // Update fields
  if (title) announcement.title = title;
  if (description) announcement.description = description;
  if (priority) announcement.priority = priority;
  if (type) announcement.type = type;
  if (targetAudience) announcement.targetAudience = targetAudience;
  if (expiresAt !== undefined) announcement.expiresAt = expiresAt;
  if (isActive !== undefined) announcement.isActive = isActive;
  if (isPinned !== undefined) announcement.isPinned = isPinned;

  await announcement.save();

  res.status(200).json({
    success: true,
    message: 'Announcement updated successfully',
    data: announcement
  });
});

// @desc    Delete announcement (Admin only)
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Announcement not found'
    });
  }

  // Soft delete
  announcement.isActive = false;
  await announcement.save();

  res.status(200).json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});

// @desc    Toggle pin announcement (Admin only)
// @route   PUT /api/announcements/:id/toggle-pin
// @access  Private/Admin
const togglePin = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: 'Announcement not found'
    });
  }

  await announcement.togglePin();

  res.status(200).json({
    success: true,
    message: `Announcement ${announcement.isPinned ? 'pinned' : 'unpinned'} successfully`,
    data: announcement
  });
});

// @desc    Get all announcements for admin management
// @route   GET /api/announcements/admin/all
// @access  Private/Admin
const getAllAnnouncementsAdmin = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const status = req.query.status || 'all'; // 'all', 'active', 'expired', 'inactive'

  const startIndex = (page - 1) * limit;
  let query = {};

  // Filter by status
  switch (status) {
    case 'active':
      query = {
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      };
      break;
    case 'expired':
      query = {
        expiresAt: { $lte: new Date() }
      };
      break;
    case 'inactive':
      query = { isActive: false };
      break;
    default:
      query = {}; // All announcements
  }

  const announcements = await Announcement.find(query)
    .populate('author', 'name profileImage')
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit)
    .skip(startIndex);

  const total = await Announcement.countDocuments(query);

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
    count: announcements.length,
    pagination,
    totalPages,
    currentPage: page,
    total,
    data: announcements
  });
});

module.exports = {
  getAnnouncements,
  getAnnouncementCount,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePin,
  getAllAnnouncementsAdmin
};