/**
 * Daily JSON Downloader
 *
 * This script downloads the two essential MTGJSON source files:
 *
 * - AllIdentifiers.json → Contains full card metadata (uuid, name, set, etc.)
 * - AllPrices.json → Contains historical + current price data for each card
 *
 * Why we need this:
 * - These files form the foundation of the Goblin Bookie price sync system.
 * - They are large (hundreds of MB to 1+ GB), so streaming and error handling are critical.
 * - The script saves them to `/temp` for later parsing by `parseCards.ts` and `parsePrices.ts`.
 *
 * Implementation notes:
 * - Downloads via Node's `https` module (no external libs required)
 * - Streams data to disk to avoid memory spikes
 * - Handles errors cleanly (non-200 status, network failure, etc.)
 * - Automatically logs each file download and any failures
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const destinationDir = path.join(__dirname, '../temp');

/**
 * Downloads a file from the given URL and writes it directly to disk.
 * Ensures that incomplete or failed downloads are cleaned up.
 */
async function downloadFile(url: string, filename: string) {
  return new Promise<void>((resolve, reject) => {
    const filePath = path.join(destinationDir, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          // Fail early on bad HTTP status (e.g., 404 or 500)
          return reject(new Error(`Failed: ${response.statusCode}`));
        }

        // Pipe the incoming response stream to the output file
        response.pipe(file);

        // Log and resolve once the file is finished writing
        file.on('finish', () =>
          file.close(() => {
            log(`Downloaded ${filename}`);
            resolve();
          })
        );
      })
      .on('error', (err) => {
        // Clean up partial file if the download fails
        fs.unlink(filePath, () => {});
        logError(`Failed downloading ${filename}: ${err.message}`);
        reject(err);
      });
  });
}

// Main routine to download both MTGJSON files
(async () => {
  try {
    log(`Starting daily download...`);

    // AllIdentifiers.json contains core card metadata for parsing
    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');

    // AllPrices.json contains full historical pricing by UUID
    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');

    log('Finished downloading daily MTGJSON files.');
  } catch (err) {
    logError(`Download process failed: ${err}`);
  }
})();
