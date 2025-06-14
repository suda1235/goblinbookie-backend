/**
 * Daily JSON Downloader
 *
 * Purpose:
 * This script downloads the two critical MTGJSON data files used by Goblin Bookie:
 *
 * - AllIdentifiers.json: Contains comprehensive card metadata (uuid, name, setCode, etc.)
 * - AllPrices.json: Contains both historical and current price data for every card
 *
 * Why this is needed:
 * - These files are the starting point for the entire sync pipeline; all parsing and merging depend on them.
 * - Both files are very large, so the download is streamed directly to disk to prevent memory overload.
 * - Files are saved to the `/temp` directory for subsequent scripts to process.
 *
 * Implementation details:
 * - Uses Node's native `https` module for HTTP requests (no extra dependencies).
 * - Streams each response to disk efficiently, line by line.
 * - Cleans up incomplete files and handles network/HTTP errors gracefully.
 * - Logs the status of each download for monitoring and debugging.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const destinationDir = path.join(__dirname, '../temp');

/**
 * Downloads a file from the specified URL and saves it directly to disk.
 * Handles partial downloads and errors by cleaning up any incomplete files.
 */
async function downloadFile(url: string, filename: string) {
  return new Promise<void>((resolve, reject) => {
    const filePath = path.join(destinationDir, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          // Abort on non-success HTTP status
          return reject(new Error(`Failed: ${response.statusCode}`));
        }

        // Stream the response directly into the file
        response.pipe(file);

        // Resolve once writing is complete
        file.on('finish', () =>
          file.close(() => {
            log(`Downloaded ${filename}`);
            resolve();
          })
        );
      })
      .on('error', (err) => {
        // Delete the partial file on any error
        fs.unlink(filePath, () => {});
        logError(`Failed downloading ${filename}: ${err.message}`);
        reject(err);
      });
  });
}

// Main script: Download both MTGJSON files in sequence
(async () => {
  try {
    log(`Starting daily download...`);

    // Download the card metadata file
    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');

    // Download the price history file
    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');

    log('Finished downloading daily MTGJSON files.');
  } catch (err) {
    logError(`Download process failed: ${err}`);
  }
})();
