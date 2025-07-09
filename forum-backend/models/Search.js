const mongoose = require('mongoose');

const searchSchema = new mongoose.Schema({
  term: {
    type: String,
    required: [true, 'Search term is required'],
    lowercase: true,
    trim: true,
    maxlength: [100, 'Search term cannot be more than 100 characters']
  },
  normalizedTerm: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  searchCount: {
    type: Number,
    default: 1,
    min: 1
  },
  lastSearched: {
    type: Date,
    default: Date.now
  },
  searchedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    searchedAt: {
      type: Date,
      default: Date.now
    }
  }],
  resultCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for performance
searchSchema.index({ normalizedTerm: 1 });
searchSchema.index({ searchCount: -1 });
searchSchema.index({ lastSearched: -1 });
searchSchema.index({ isActive: 1 });

// Middleware to normalize search term
searchSchema.pre('save', function(next) {
  if (this.isModified('term')) {
    this.normalizedTerm = this.term.toLowerCase().trim();
  }
  next();
});

// Static method to record search
searchSchema.statics.recordSearch = async function(searchTerm, userId = null, resultCount = 0) {
  const normalizedTerm = searchTerm.toLowerCase().trim();
  
  let searchRecord = await this.findOne({ normalizedTerm });
  
  if (searchRecord) {
    // Update existing search record
    searchRecord.searchCount += 1;
    searchRecord.lastSearched = new Date();
    searchRecord.resultCount = resultCount;
    
    if (userId) {
      searchRecord.searchedBy.push({
        userId,
        searchedAt: new Date()
      });
    }
    
    await searchRecord.save();
  } else {
    // Create new search record
    const searchData = {
      term: searchTerm,
      normalizedTerm,
      searchCount: 1,
      lastSearched: new Date(),
      resultCount
    };
    
    if (userId) {
      searchData.searchedBy = [{
        userId,
        searchedAt: new Date()
      }];
    }
    
    searchRecord = await this.create(searchData);
  }
  
  return searchRecord;
};

// Static method to get popular searches
searchSchema.statics.getPopularSearches = function(limit = 3, timeFrame = 30) {
  const timeLimit = new Date();
  timeLimit.setDate(timeLimit.getDate() - timeFrame);
  
  return this.find({
    isActive: true,
    lastSearched: { $gte: timeLimit },
    searchCount: { $gte: 2 } // Minimum 2 searches to be considered popular
  })
  .sort({ searchCount: -1, lastSearched: -1 })
  .limit(limit)
  .select('term searchCount lastSearched');
};

// Static method to get recent searches
searchSchema.statics.getRecentSearches = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ lastSearched: -1 })
    .limit(limit)
    .select('term searchCount lastSearched resultCount');
};

// Static method to clean up old searches
searchSchema.statics.cleanupOldSearches = function(days = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.deleteMany({
    lastSearched: { $lt: cutoffDate },
    searchCount: { $lt: 5 } // Keep popular searches even if old
  });
};

module.exports = mongoose.model('Search', searchSchema);