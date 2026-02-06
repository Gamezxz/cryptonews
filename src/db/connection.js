import mongoose from 'mongoose';
import config from '../../config/default.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    isConnected = true;
    console.log('MongoDB: Connected');
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export async function disconnectDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('MongoDB: Disconnected');
  }
}

export default { connectDB, disconnectDB };
