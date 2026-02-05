export default {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cryptonews',
    options: {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },
  server: {
    port: process.env.PORT || 13002
  },
  scheduler: {
    cronSchedule: process.env.CRON_SCHEDULE || '* * * * *' // Every 1 minute
  },
  cache: {
    filePath: './data/cache.json'
  },
  output: {
    dir: './output'
  },
  templates: {
    dir: './templates'
  }
};
