import mongoose from 'mongoose';
import config from '../../config/default.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    console.log('MongoDB: Using existing connection');
    return mongoose.connection;
  }

  try {
    console.log(`MongoDB: Connecting to ${config.mongodb.uri}`);
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    isConnected = true;
    console.log('MongoDB: Connected successfully');
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
