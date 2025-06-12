import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const tempDir = path.join(__dirname, '../temp');
const keepFile = '.keep';

async function cleanDirectoryExcept(fileToKeep: string) {
  try {
    const files = await fs.promises.readdir(tempDir);
    const deletions = files
      .filter((file) => file !== fileToKeep)
      .map((file) =>
        fs.promises.unlink(path.join(tempDir, file)).then(() => log(`Deleted file: ${file}`))
      );

    await Promise.all(deletions);
    log(`Cleaned directory: ${tempDir} (except ${fileToKeep})`);
  } catch (err: any) {
    logError(`Cleanup failed: ${err.message}`);
  }
}

cleanDirectoryExcept(keepFile);
