const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Announcement title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Announcement description is required'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    required: true
  },
  authorImage: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  type: {
    type: String,
    enum: ['general', 'maintenance', 'feature', 'policy', 'event'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: null
  },
  views: {
    type: Number,
    default: 0
  },
  targetAudience: {
    type: String,
    enum: ['all', 'members', 'admins'],
    default: 'all'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual to check if announcement is expired
announcementSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual to check if announcement is current
announcementSchema.virtual('isCurrent').get(function() {
  return this.isActive && (!this.expiresAt || this.expiresAt > new Date());
});

// Index for performance
announcementSchema.index({ isActive: 1, isPinned: -1, createdAt: -1 });
announcementSchema.index({ expiresAt: 1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ targetAudience: 1 });

// Middleware to handle expiry
announcementSchema.pre('save', function(next) {
  if (this.expiresAt && this.expiresAt <= new Date()) {
    this.isActive = false;
  }
  next();
});

// Instance method to increment views
announcementSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Instance method to pin/unpin announcement
announcementSchema.methods.togglePin = function() {
  this.isPinned = !this.isPinned;
  return this.save();
};

// Static method to get current announcements
announcementSchema.statics.getCurrentAnnouncements = function(targetAudience = 'all') {
  const query = {
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (targetAudience !== 'all') {
    query.targetAudience = { $in: [targetAudience, 'all'] };
  }

  return this.find(query)
    .populate('author', 'name profileImage')
    .sort({ isPinned: -1, priority: -1, createdAt: -1 });
};

// Static method to get announcement count
announcementSchema.statics.getAnnouncementCount = function(targetAudience = 'all') {
  const query = {
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (targetAudience !== 'all') {
    query.targetAudience = { $in: [targetAudience, 'all'] };
  }

  return this.countDocuments(query);
};

// Static method to cleanup expired announcements
announcementSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      expiresAt: { $lte: new Date() },
      isActive: true
    },
    {
      isActive: false
    }
  );
};

module.exports = mongoose.model('Announcement', announcementSchema);