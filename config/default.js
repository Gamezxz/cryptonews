export default {
  mongodb: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/cryptonews",
    options: {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    },
  },
  server: {
    port: process.env.PORT || 13002,
  },
  scheduler: {
    cronSchedule: process.env.CRON_SCHEDULE || "*/15 * * * *", // Every 15 minutes
  },
  cache: {
    filePath: "./data/cache.json",
  },
  output: {
    dir: "./output",
  },
  templates: {
    dir: "./templates",
  },
  admin: {
    key: process.env.ADMIN_KEY || "admin123",
    statsInterval: 10000,
  },
};
