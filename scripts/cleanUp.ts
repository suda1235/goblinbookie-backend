/**
 * Cleanup Script
 *
 * Purpose:
 * This script removes all temporary files generated in the `/temp` directory during the sync pipeline,
 * except for a single `.keep` file. The `.keep` file ensures that the `/temp` directory is retained
 * in version control systems (like Git) even when empty.
 *
 * Why cleanup is necessary:
 * - Sync scripts generate large intermediate NDJSON files (parsed, sorted, merged) that quickly consume disk space.
 * - Deleting them after each run keeps the working directory tidy and prevents disk usage from growing over time.
 * - The `.keep` file is intentionally preserved so `/temp` remains available for future pipeline runs.
 *
 * Implementation details:
 * - Reads all files in `/temp` using `fs.promises.readdir`.
 * - Filters out the `.keep` file so it is not deleted.
 * - Deletes all other files in parallel using `Promise.all`.
 * - Logs each deleted file and a summary message when cleanup is complete.
 * - On error, logs a descriptive failure message.
 */

import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const tempDir = path.join(__dirname, '../temp');
const keepFile = '.keep'; // File to always retain, used to keep the temp folder under version control

/**
 * Deletes all files in the target directory except for the specified file to keep.
 * Logs every file deleted and a summary on completion.
 */
async function cleanDirectoryExcept(fileToKeep: string) {
  try {
    // List all files currently in the temp directory
    const files = await fs.promises.readdir(tempDir);

    // Delete all files except the designated keep file, logging each deletion
    const deletions = files
      .filter((file) => file !== fileToKeep)
      .map((file) =>
        fs.promises.unlink(path.join(tempDir, file)).then(() => log(`Deleted file: ${file}`))
      );

    // Wait for all deletions to finish
    await Promise.all(deletions);

    log(`Cleaned directory: ${tempDir} (except ${fileToKeep})`);
  } catch (err: any) {
    logError(`Cleanup failed: ${err.message}`);
  }
}

// Run the cleanup process, preserving only the `.keep` file
cleanDirectoryExcept(keepFile);
