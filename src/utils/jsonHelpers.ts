/**
 * Minimal JSON Helper Utilities
 *
 * This file defines a small set of shared utilities used across the Goblin Bookie
 * MTGJSON sync scripts. These functions focus only on what's actively needed:
 *
 * Logging: Standardizes log formatting using Winston (`logger.ts`)
 * Stream Handling: Ensures streamed file writes (NDJSON) are fully flushed
 *
 */

import fs from 'fs';
import { logger } from './logger';

/**
 * Info-level logger used in all sync scripts for success and progress messages.
 */
export function log(message: string) {
  logger.info(message);
}

/**
 * Error-level logger used across scripts for consistent error reporting.
 */
export function logError(message: string) {
  logger.error(message);
}

/**
 * Ensures a WriteStream (e.g. for NDJSON output) has completely flushed before proceeding.
 * This prevents race conditions in multi-step pipelines.
 */
export function waitForStreamFinish(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
