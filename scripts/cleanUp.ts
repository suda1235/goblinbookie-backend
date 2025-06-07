/**
 * Cleanup Script
 *
 * This script is run at the end of the daily sync process.
 * It deletes all temporary .json files from the /temp directory
 * to ensure that each run starts with a clean slate.
 *
 * Only .json files are affected, and logs are printed to confirm
 * successful cleanup or highlight any errors.
 */

import path from 'path';
import { cleanDirectory, log, logError } from '../src/utils/jsonHelpers';

async function cleanup() {
  try {
    log('Starting cleanup...');

    const tempDir = path.join(__dirname, '../temp');

    // Remove all JSON files in the temp directory
    await cleanDirectory(tempDir, /\.json$/);

    log('Cleanup complete.');
  } catch (err) {
    logError(`Cleanup failed: ${err}`);
  }
}

cleanup();
