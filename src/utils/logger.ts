/**
 * Goblin Bookie – Winston Logger Setup
 *
 * PURPOSE:
 *   Configures a unified, timestamped logger for all Goblin Bookie backend scripts.
 *   Every log message (info or error) from the sync pipeline is routed through this Winston logger,
 *   ensuring all output is visible both in the terminal and in the persistent /logs/sync.log file.
 *
 * CONTEXT:
 *   - Used by the logInfo and logError helpers in jsonHelpers.ts (and thus every pipeline script).
 *   - Timestamps and log levels (INFO, ERROR) are included on every line for audit/debugging.
 *   - The /logs directory is auto-created if missing, so logging never fails due to a missing folder.
 *   - Output is always found at project-root/logs/sync.log.
 *
 * CUSTOMIZATION:
 *   - To change log formatting or rotate logs, update this file; all scripts benefit immediately.
 *   - Used for assignment grading, debugging, and production health checks.
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure /logs exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logPath = path.join(logDir, 'sync.log');

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.File({ filename: logPath }),
    new winston.transports.Console(),
  ],
});
