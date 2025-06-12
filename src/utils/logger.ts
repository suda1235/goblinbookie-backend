/**
 * Goblin Bookie – Winston Logger Setup
 *
 * This logger provides unified log output across all scripts in the sync pipeline.
 *
 * Dual output: logs to both a persistent file (`/logs/sync.log`) and the console
 * Timestamped: each log includes a human-readable ISO timestamp
 * Structured: clean format like `[2025-06-12T04:41:48.063Z] INFO: Message`
 *
 * We use this for all `log(...)` and `logError(...)` calls from jsonHelpers.ts
 * so that script progress and errors are consistently captured.
 */

import winston from 'winston';
import path from 'path';

// Absolute path to the output log file
const logPath = path.join(__dirname, '../../logs/sync.log');

export const logger = winston.createLogger({
  level: 'info', // Default log level (INFO and higher: WARN, ERROR)
  format: winston.format.combine(
    winston.format.timestamp(), // Adds ISO timestamp to each log
    winston.format.printf(
      ({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.File({ filename: logPath }), // Persist logs to file
    new winston.transports.Console(), // Also show logs in terminal
  ],
});
