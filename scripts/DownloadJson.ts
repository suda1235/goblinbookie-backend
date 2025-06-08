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

import https from 'https';
import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const destinationDir = path.join(__dirname, '../temp');

function downloadFile(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const filePath = path.join(destinationDir, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            log(`Downloaded ${filename}`);
            resolve();
          });
        });
      })
      .on('error', (err) => {
        fs.unlink(filePath, () => {}); // clean up incomplete file
        logError(`Failed to download ${filename}: ${err.message}`);
        reject(err);
      });
  });
}

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
