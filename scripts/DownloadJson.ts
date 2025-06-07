import { DownloaderHelper } from 'node-downloader-helper';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

/**
 * Downloads a single file from the given MTGJSON URL and saves it to the /temp directory.
 * Retries on failure up to 3 times with a 2-second delay between attempts.
 */
function downloadFile(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const destinationDir = path.join(__dirname, '../temp');

    const dl = new DownloaderHelper(url, destinationDir, {
      fileName: filename,
      retry: { maxRetries: 3, delay: 2000 },
    });

    dl.on('end', () => {
      log(`Downloaded ${filename}`);
      resolve();
    });

    dl.on('error', (err) => {
      logError(`Failed to download ${filename}: ${err}`);
      reject(err);
    });

    dl.start();
  });
}

/**
 * Downloads the current versions of AllPrices.json and AllIdentifiers.json from MTGJSON.
 * These files are required for price parsing and card identification.
 */
(async () => {
  try {
    log('Starting downloadJson...');

    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');
    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');

    log('Finished downloading MTGJSON files.');
  } catch (err) {
    logError(`Download process failed: ${err}`);
  }
})();
