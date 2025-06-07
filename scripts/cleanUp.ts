import path from 'path';
import { cleanDirectory, log, logError } from '../src/utils/jsonHelpers';

async function cleanup() {
  try {
    log('Starting cleanup...');

    const tempDir = path.join(__dirname, '../temp');

    // Delete all .json files in temp
    await cleanDirectory(tempDir, /\.json$/);

    log('Cleanup complete.');
  } catch (err) {
    logError(`Cleanup failed: ${err}`);
  }
}

cleanup();
