/**
 * Goblin Bookie – Shared JSON & Filesystem Helpers
 *
 * PURPOSE:
 *   Centralizes all reusable utilities for logging, streaming, and directory/file management,
 *   making the Goblin Bookie backend scripts DRY, readable, and easy to maintain.
 *
 * CONTEXT:
 *   - Every backend script (download, parse, merge, upload, clean) imports from this file.
 *   - Standardizes logging conventions: every log is tagged with the script/step for traceability.
 *   - Includes stream/file utilities to prevent subtle race conditions and cross-platform bugs.
 *   - Ensures directories (like /temp, /logs) always exist before file operations.
 *
 * MAINTENANCE:
 *   - Update logging format or stream safety once here—improves every script at once.
 *   - Keeps scripts focused on business logic, not boilerplate.
 *   - Fully documented for future maintainers, instructors, and yourself.
 */

import fs from 'fs';

import { logger } from './logger';

/**
 * Logs an info-level message with a context tag (step/module name).
 * Example: logInfo('parseCards', 'Total: 55000, Kept: 48750')
 */
export function logInfo(tag: string, message: string) {
  logger.info(`${tag} ${message}`);
}

/**
 * Logs an error-level message with a context tag (step/module name).
 * Example: logError('parsePrices', 'Failed to parse: Unexpected token')
 */
export function logError(tag: string, message: string) {
  logger.error(`[${tag}] ${message}`);
}

/**
 * Ensures a WriteStream has finished writing and fully flushed to disk.
 * Prevents race conditions when chaining scripts or closing writers.
 */
export function waitForStreamFinish(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/**
 * Ensures the specified directory exists; creates it recursively if missing.
 * Prevents file system errors on first run or after cleanup.
 */
export function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logInfo('helper', `Created missing directory: ${dirPath}`);
  }
}
