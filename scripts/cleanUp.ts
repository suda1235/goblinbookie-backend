/**
 * Goblin Bookie – Cleanup Script
 *
 * PURPOSE:
 *   Deletes all temporary files in /temp generated during the sync pipeline,
 *   except for a single `.keep` file (which ensures the directory is retained in Git).
 *
 * IMPLEMENTATION DETAILS:
 *   - Reads all files in /temp
 *   - Deletes all except `.keep`.
 *   - Logs each deletion and a summary, or any errors encountered.
 */

import fs from 'fs';
import path from 'path';
import { logInfo, logError } from '../src/utils/jsonHelpers';

const tempDir = path.join(__dirname, '../temp');
const keepFile = '.keep'; // File to always retain

/**
 * Deletes all files in the directory except for the one specified.
 * Logs every file deleted and a summary on completion.
 */
async function cleanDirectoryExcept(fileToKeep: string) {
  try {
    const files = await fs.promises.readdir(tempDir);

    const deletions = files
      .filter((file) => file !== fileToKeep)
      .map((file) =>
        fs.promises
          .unlink(path.join(tempDir, file))
          .then(() => logInfo('[cleanUp.ts]', `Deleted file: ${file}`))
      );

    await Promise.all(deletions);

    logInfo('[cleanUp.ts]', `Cleaned directory: ${tempDir} (except ${fileToKeep})`);
  } catch (err: any) {
    logError('[cleanUp.ts]', `Cleanup failed: ${err.message}`);
  }
}

cleanDirectoryExcept(keepFile);
