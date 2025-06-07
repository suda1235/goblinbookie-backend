/**
 * Daily Data Downloader
 *
 * This script downloads the two main MTGJSON files needed
 * for the daily card and price update process:
 *
 * - AllIdentifiers.json → full list of card printings (used to extract basic card metadata)
 * - AllPrices.json → historical + current price data for each card
 *
 * Files are saved to the /temp directory for processing by later scripts.
 * The download uses automatic retries to handle network flakiness.
 */

import { DownloaderHelper } from 'node-downloader-helper';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const destinationDir = path.join(__dirname, '../temp');

/**
 * Helper function to download a file and retry on failure
 */
function downloadFile(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dl = new DownloaderHelper(url, destinationDir, {
      fileName: filename,
      retry: { maxRetries: 3, delay: 2000 }, // Retry if the download fails
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
 * Main download routine – fetch both MTGJSON files sequentially
 */
(async () => {
  try {
    log(`Starting daily download...`);

    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');
    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');

    log('Finished downloading MTGJSON daily files.');
  } catch (err) {
    logError(`Download process failed: ${err}`);
  }
})();
