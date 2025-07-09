const User = require('../models/User');
const { sendTokenResponse } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, profileImage } = req.body;

  // Validation
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide name, email and password'
    });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    profileImage: profileImage || undefined,
    lastLogin: new Date()
  });

  sendTokenResponse(user, 201, res, 'User registered successfully');
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an email and password'
    });
  }

  // Check for user (include password in select)
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated. Please contact administrator.'
    });
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  sendTokenResponse(user, 200, res, 'Login successful');
});

// @desc    Social auth (Google, Facebook, etc.)
// @route   POST /api/auth/social
// @access  Public
const socialAuth = asyncHandler(async (req, res) => {
  const { name, email, profileImage, provider, providerId } = req.body;

  // Validation
  if (!name || !email || !provider || !providerId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required social auth data'
    });
  }

  // Check if user exists
  let user = await User.findOne({ email });

  if (user) {
    // User exists, update social auth info if needed
    if (!user.socialAuth.isEnabled) {
      user.socialAuth = {
        isEnabled: true,
        provider,
        providerId
      };
      user.profileImage = profileImage || user.profileImage;
      user.lastLogin = new Date();
      await user.save();
    }
  } else {
    // Create new user for social auth
    user = await User.create({
      name,
      email,
      profileImage: profileImage || undefined,
      socialAuth: {
        isEnabled: true,
        provider,
        providerId
      },
      lastLogin: new Date()
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated. Please contact administrator.'
    });
  }

  sendTokenResponse(user, 200, res, 'Social authentication successful');
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  // Get user with populated virtual fields
  const user = await User.findById(req.user._id)
    .populate('postsCount')
    .populate('commentsCount');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const { name, profileImage, aboutMe } = req.body;

  const fieldsToUpdate = {};

  if (name) fieldsToUpdate.name = name;
  if (profileImage) fieldsToUpdate.profileImage = profileImage;
  if (aboutMe !== undefined) fieldsToUpdate.aboutMe = aboutMe;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/auth/password
// @access  Private
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Please provide current password and new password'
    });
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  if (user.socialAuth.isEnabled && !user.password) {
    return res.status(400).json({
      success: false,
      message: 'Cannot update password for social authentication account'
    });
  }

  const isMatch = await user.matchPassword(currentPassword);

  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, res, 'Password updated successfully');
});

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
});

// @desc    Deactivate user account
// @route   DELETE /api/auth/deactivate
// @access  Private
const deactivateAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { isActive: false });

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Account deactivated successfully'
  });
});

// @desc    Check if user can post (post limit check)
// @route   GET /api/auth/can-post
// @access  Private
const canPost = asyncHandler(async (req, res) => {
  const Post = require('../models/Post');
  
  // Count user's posts
  const postCount = await Post.countDocuments({ 
    author: req.user._id, 
    isActive: true 
  });

  const hasGoldMembership = req.user.hasMembership();
  const canCreatePost = hasGoldMembership || postCount < 5;

  res.status(200).json({
    success: true,
    data: {
      canPost: canCreatePost,
      currentPosts: postCount,
      postLimit: hasGoldMembership ? 'unlimited' : 5,
      membership: req.user.membership,
      reason: !canCreatePost ? 'Post limit reached. Upgrade to Gold membership for unlimited posts.' : null
    }
  });
});

module.exports = {
  register,
  login,
  socialAuth,
  getMe,
  updateProfile,
  updatePassword,
  logout,
  deactivateAccount,
  canPost
};