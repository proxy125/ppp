const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  password: {
    type: String,
    required: function() {
      return !this.socialAuth.isEnabled;
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  profileImage: {
    type: String,
    default: 'https://via.placeholder.com/150/000000/FFFFFF/?text=User'
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  membership: {
    type: String,
    enum: ['bronze', 'gold'],
    default: 'bronze'
  },
  badges: [{
    type: {
      type: String,
      enum: ['bronze', 'gold'],
      required: true
    },
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  aboutMe: {
    type: String,
    maxlength: [500, 'About me cannot be more than 500 characters'],
    default: ''
  },
  socialAuth: {
    isEnabled: {
      type: Boolean,
      default: false
    },
    provider: {
      type: String,
      enum: ['google', 'facebook', 'github'],
      default: null
    },
    providerId: {
      type: String,
      default: null
    }
  },
  membershipExpiry: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for user's posts count
userSchema.virtual('postsCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'author',
  count: true
});

// Virtual for user's comments count
userSchema.virtual('commentsCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'author',
  count: true
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ membership: 1 });

// Middleware to hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware to add bronze badge on user creation
userSchema.pre('save', function(next) {
  if (this.isNew) {
    this.badges.push({
      type: 'bronze',
      earnedAt: new Date()
    });
  }
  next();
});

// Instance method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method to check if user is admin
userSchema.methods.isAdmin = function() {
  return this.role === 'admin';
};

// Instance method to check if user has membership
userSchema.methods.hasMembership = function() {
  return this.membership === 'gold' && (!this.membershipExpiry || this.membershipExpiry > new Date());
};

// Instance method to upgrade to gold membership
userSchema.methods.upgradeToGold = function() {
  this.membership = 'gold';
  this.membershipExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  
  // Add gold badge if not already exists
  const hasGoldBadge = this.badges.some(badge => badge.type === 'gold');
  if (!hasGoldBadge) {
    this.badges.push({
      type: 'gold',
      earnedAt: new Date()
    });
  }
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);