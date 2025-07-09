const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  try {
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Get token from Bearer token
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // Get token from cookie
      token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authorized to access this route' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'No user found with this token' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'User account is deactivated' 
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized to access this route' 
    });
  }
};

// Admin only access
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Admin access required' 
    });
  }
};

// Check if user has membership (Gold badge)
const requireMembership = (req, res, next) => {
  if (req.user && req.user.hasMembership()) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'Gold membership required for this action' 
    });
  }
};

// Optional authentication - don't throw error if no token
const optionalAuth = async (req, res, next) => {
  let token;

  try {
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
};

// Check post ownership or admin
const checkPostOwnership = async (req, res, next) => {
  try {
    const Post = require('../models/Post');
    const post = await Post.findById(req.params.id || req.params.postId);
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }

    // Allow if user is admin or post owner
    if (req.user.role === 'admin' || post.author.toString() === req.user._id.toString()) {
      req.post = post;
      next();
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to access this post' 
      });
    }
  } catch (error) {
    console.error('Post ownership check error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking post ownership' 
    });
  }
};

// Check comment ownership or admin
const checkCommentOwnership = async (req, res, next) => {
  try {
    const Comment = require('../models/Comment');
    const comment = await Comment.findById(req.params.id || req.params.commentId);
    
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Comment not found' 
      });
    }

    // Allow if user is admin or comment owner
    if (req.user.role === 'admin' || comment.author.toString() === req.user._id.toString()) {
      req.comment = comment;
      next();
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to access this comment' 
      });
    }
  } catch (error) {
    console.error('Comment ownership check error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error checking comment ownership' 
    });
  }
};

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Send token response with cookie
const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  // Create token
  const token = generateToken(user._id);

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000 || 7 * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    sameSite: 'strict'
  };

  res
    .status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      message,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
        membership: user.membership,
        badges: user.badges,
        aboutMe: user.aboutMe
      }
    });
};

module.exports = {
  protect,
  admin,
  requireMembership,
  optionalAuth,
  checkPostOwnership,
  checkCommentOwnership,
  generateToken,
  sendTokenResponse
};