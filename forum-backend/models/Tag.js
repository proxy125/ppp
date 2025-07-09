const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tag name is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [30, 'Tag name cannot be more than 30 characters']
  },
  displayName: {
    type: String,
    required: [true, 'Tag display name is required'],
    trim: true,
    maxlength: [30, 'Tag display name cannot be more than 30 characters']
  },
  description: {
    type: String,
    maxlength: [200, 'Tag description cannot be more than 200 characters'],
    default: ''
  },
  color: {
    type: String,
    default: '#3B82F6', // Default blue color
    match: [/^#([0-9A-F]{3}){1,2}$/i, 'Please enter a valid hex color']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for posts using this tag
tagSchema.virtual('postsCount', {
  ref: 'Post',
  localField: 'name',
  foreignField: 'tags',
  count: true
});

// Index for performance
tagSchema.index({ name: 1 });
tagSchema.index({ isActive: 1 });
tagSchema.index({ usageCount: -1 });

// Middleware to update usageCount
tagSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

tagSchema.methods.decrementUsage = function() {
  if (this.usageCount > 0) {
    this.usageCount -= 1;
    return this.save();
  }
};

// Static method to get popular tags
tagSchema.statics.getPopularTags = function(limit = 20) {
  return this.find({ isActive: true })
    .sort({ usageCount: -1, createdAt: -1 })
    .limit(limit);
};

// Static method to search tags
tagSchema.statics.searchTags = function(searchTerm, limit = 10) {
  return this.find({
    $and: [
      { isActive: true },
      {
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { displayName: { $regex: searchTerm, $options: 'i' } }
        ]
      }
    ]
  })
  .sort({ usageCount: -1 })
  .limit(limit);
};

module.exports = mongoose.model('Tag', tagSchema);