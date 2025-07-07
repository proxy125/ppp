const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  postTitle: {
    type: String,
    required: true
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
  authorEmail: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    maxlength: [1000, 'Comment cannot be more than 1000 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    feedback: {
      type: String,
      enum: [
        'Inappropriate content',
        'Spam or promotional content',
        'Harassment or bullying',
        'False information',
        'Off-topic discussion'
      ],
      required: true
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
      default: 'pending'
    }
  }],
  isReported: {
    type: Boolean,
    default: false
  },
  moderationStatus: {
    type: String,
    enum: ['approved', 'pending', 'flagged', 'removed'],
    default: 'approved'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total reports count
commentSchema.virtual('reportsCount').get(function() {
  return this.reports.length;
});

// Virtual for pending reports count
commentSchema.virtual('pendingReportsCount').get(function() {
  return this.reports.filter(report => report.status === 'pending').length;
});

// Index for performance
commentSchema.index({ post: 1 });
commentSchema.index({ author: 1 });
commentSchema.index({ createdAt: -1 });
commentSchema.index({ isActive: 1, moderationStatus: 1 });
commentSchema.index({ isReported: 1 });

// Middleware to update isReported field
commentSchema.pre('save', function(next) {
  this.isReported = this.reports.length > 0;
  next();
});

// Instance method to add report
commentSchema.methods.addReport = function(userId, feedback) {
  // Check if user has already reported this comment
  const existingReport = this.reports.find(report => report.reportedBy.equals(userId));
  if (existingReport) {
    throw new Error('You have already reported this comment');
  }

  this.reports.push({
    reportedBy: userId,
    feedback: feedback,
    reportedAt: new Date(),
    status: 'pending'
  });

  this.isReported = true;
  return this.save();
};

// Instance method to update report status
commentSchema.methods.updateReportStatus = function(reportId, status) {
  const report = this.reports.id(reportId);
  if (!report) {
    throw new Error('Report not found');
  }

  report.status = status;
  return this.save();
};

// Instance method to moderate comment
commentSchema.methods.moderate = function(status, moderatorId) {
  this.moderationStatus = status;
  
  if (status === 'removed') {
    this.isActive = false;
  }

  return this.save();
};

// Static method to get reported comments
commentSchema.statics.getReportedComments = function() {
  return this.find({ isReported: true })
    .populate('author', 'name email profileImage')
    .populate('post', 'title')
    .populate('reports.reportedBy', 'name email')
    .sort({ createdAt: -1 });
};

// Static method to get comments by post
commentSchema.statics.getCommentsByPost = function(postId, limit = 20, skip = 0) {
  return this.find({ 
    post: postId, 
    isActive: true, 
    moderationStatus: { $in: ['approved', 'pending'] }
  })
  .populate('author', 'name profileImage')
  .sort({ createdAt: 1 })
  .limit(limit)
  .skip(skip);
};

module.exports = mongoose.model('Comment', commentSchema);