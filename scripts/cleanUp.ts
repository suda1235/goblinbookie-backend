/**
 * Cleanup Script
 *
 * This script deletes all temporary files in the `/temp` directory
 * **except** a specific file (`.keep`) that is intentionally preserved.
 *
 * Why we need this:
 * - NDJSON files created during the sync process (parsed, sorted, merged) are large.
 * - To minimize disk usage and prevent buildup, we remove them after each run.
 * - The `.keep` file exists to ensure the `/temp` directory remains tracked in Git.
 *
 * Implementation notes:
 * - Uses `fs.promises.readdir` to list all files.
 * - Uses `.filter()` to exclude the keep file.
 * - Deletes all others in parallel using `Promise.all`.
 * - Logs each file deleted and reports total cleanup.
 */

import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const tempDir = path.join(__dirname, '../temp');
const keepFile = '.keep'; // File to preserve (used to retain /temp in Git even when empty)

async function cleanDirectoryExcept(fileToKeep: string) {
  try {
    // Read all filenames in the /temp directory
    const files = await fs.promises.readdir(tempDir);

    // Prepare a list of deletion promises for all files EXCEPT the one we want to keep
    const deletions = files
      .filter((file) => file !== fileToKeep)
      .map((file) =>
        fs.promises.unlink(path.join(tempDir, file)).then(() => log(`Deleted file: ${file}`))
      );

    // Execute all deletions in parallel
    await Promise.all(deletions);

    log(`Cleaned directory: ${tempDir} (except ${fileToKeep})`);
  } catch (err: any) {
    logError(`Cleanup failed: ${err.message}`);
  }
}

// Start cleanup, preserving only the `.keep` file
cleanDirectoryExcept(keepFile);
