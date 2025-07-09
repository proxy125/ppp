const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Post description is required'],
    maxlength: [5000, 'Description cannot be more than 5000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorImage: {
    type: String,
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
  tags: [{
    type: String,
    required: true,
    lowercase: true,
    trim: true
  }],
  upVote: {
    type: Number,
    default: 0,
    min: 0
  },
  downVote: {
    type: Number,
    default: 0,
    min: 0
  },
  voters: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    voteType: {
      type: String,
      enum: ['up', 'down'],
      required: true
    },
    votedAt: {
      type: Date,
      default: Date.now
    }
  }],
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for comments count
postSchema.virtual('commentsCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'post',
  count: true
});

// Virtual for vote difference (popularity)
postSchema.virtual('voteDifference').get(function() {
  return this.upVote - this.downVote;
});

// Virtual for total votes
postSchema.virtual('totalVotes').get(function() {
  return this.upVote + this.downVote;
});

// Index for performance
postSchema.index({ author: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ upVote: -1, downVote: 1 }); // For popularity sorting
postSchema.index({ visibility: 1, isActive: 1 });
postSchema.index({ title: 'text', description: 'text' }); // Text search

// Middleware to update lastActivity on save
postSchema.pre('save', function(next) {
  if (this.isModified('upVote') || this.isModified('downVote')) {
    this.lastActivity = new Date();
  }
  next();
});

// Instance method to vote on post
postSchema.methods.vote = function(userId, voteType) {
  // Remove any existing vote from this user
  this.voters = this.voters.filter(voter => !voter.userId.equals(userId));
  
  // Find current vote counts
  const currentUpVotes = this.voters.filter(voter => voter.voteType === 'up').length;
  const currentDownVotes = this.voters.filter(voter => voter.voteType === 'down').length;
  
  // Add new vote
  this.voters.push({
    userId: userId,
    voteType: voteType,
    votedAt: new Date()
  });
  
  // Update vote counts
  if (voteType === 'up') {
    this.upVote = currentUpVotes + 1;
    this.downVote = currentDownVotes;
  } else {
    this.downVote = currentDownVotes + 1;
    this.upVote = currentUpVotes;
  }
  
  this.lastActivity = new Date();
  return this.save();
};

// Instance method to remove vote
postSchema.methods.removeVote = function(userId) {
  // Remove vote from this user
  this.voters = this.voters.filter(voter => !voter.userId.equals(userId));
  
  // Recalculate vote counts
  this.upVote = this.voters.filter(voter => voter.voteType === 'up').length;
  this.downVote = this.voters.filter(voter => voter.voteType === 'down').length;
  
  return this.save();
};

// Instance method to check if user has voted
postSchema.methods.getUserVote = function(userId) {
  const userVote = this.voters.find(voter => voter.userId.equals(userId));
  return userVote ? userVote.voteType : null;
};

// Instance method to increment views
postSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Static method to get popular posts
postSchema.statics.getPopularPosts = function(limit = 10, skip = 0) {
  return this.aggregate([
    {
      $match: { visibility: 'public', isActive: true }
    },
    {
      $addFields: {
        voteDifference: { $subtract: ['$upVote', '$downVote'] }
      }
    },
    {
      $sort: { voteDifference: -1, createdAt: -1 }
    },
    {
      $skip: skip
    },
    {
      $limit: limit
    },
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
        authorData: 0,
        voters: 0
      }
    }
  ]);
};

// Static method to search posts by tags
postSchema.statics.searchByTags = function(searchTags, limit = 10, skip = 0) {
  return this.find({
    tags: { $in: searchTags },
    visibility: 'public',
    isActive: true
  })
  .populate('author', 'name profileImage')
  .sort({ createdAt: -1 })
  .limit(limit)
  .skip(skip);
};

module.exports = mongoose.model('Post', postSchema);