import cron from 'node-cron';
import { fetchAllSources } from './fetcher.js';
import config from '../config/default.js';

let scheduledTask = null;

export function startScheduler() {
  if (scheduledTask) {
    console.log('Scheduler already running');
    return scheduledTask;
  }

  console.log(`Starting scheduler with cron: ${config.scheduler.cronSchedule}`);

  // Initial fetch
  fetchAllSources().catch(err => {
    console.error('Initial fetch failed:', err.message);
  });

  // Schedule recurring fetches
  scheduledTask = cron.schedule(config.scheduler.cronSchedule, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch...`);

    try {
      await fetchAllSources();
    } catch (err) {
      console.error('Scheduled fetch failed:', err.message);
    }
  });

  console.log('Scheduler started successfully');
  return scheduledTask;
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Scheduler stopped');
  }
}

export function isSchedulerRunning() {
  return scheduledTask !== null;
}

export default { startScheduler, stopScheduler, isSchedulerRunning };
