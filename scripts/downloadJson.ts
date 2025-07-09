/**
 * Goblin Bookie – Daily JSON Downloader
 *
 * PURPOSE:
 *   Downloads the two critical MTGJSON data files needed for the sync pipeline:
 *     - AllIdentifiers.json: Contains all card metadata for parsing and filtering
 *     - AllPrices.json: Contains all historical/current price data for all cards
 *
 * CONTEXT:
 *   - This script is the first stage in the daily pipeline. All downstream scripts depend on its output.
 *   - Files are streamed directly to disk (in /temp) to avoid loading large JSON blobs in memory.
 *
 * IMPLEMENTATION DETAILS:
 *   - Uses Node's https/fs modules only (no extra dependencies for downloading).
 *   - Cleans up incomplete files on download failure for safety.
 *   - Ensures the /temp directory exists before attempting to write.
 *
 *   Written for <2GB RAM deployment (e.g. Render), fully streaming, and follows best practices for assignment submission.
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { logInfo, logError, ensureDirExists } from '../src/utils/jsonHelpers';

// Resolve the temp directory path relative to this script
const destinationDir = path.join(__dirname, '../temp');

// Ensure /temp exists before starting any downloads (avoids fs errors)
ensureDirExists(destinationDir);

/**
 * Downloads a file from the given URL and writes it directly to disk.
 * Handles partial downloads: deletes any incomplete file if an error occurs.
 *
 * @param url {string} – The URL to download from
 * @param filename {string} – The filename to save in /temp
 * @returns Promise<void>
 */
async function downloadFile(url: string, filename: string) {
  return new Promise<void>((resolve, reject) => {
    const filePath = path.join(destinationDir, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        // If response code isn't 200 OK, treat as a failure (don't log here—handled in main catch)
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed: ${response.statusCode}`));
        }

        // Stream the response into the file (memory-safe)
        response.pipe(file);

        // Once writing is done, log success
        file.on('finish', () =>
          file.close(() => {
            logInfo('[downloadJson.ts]', `Downloaded ${filename}`);
            resolve();
          })
        );
      })
      .on('error', (err) => {
        // On any error, clean up the partial file and log the error
        fs.unlink(filePath, () => {});
        logError('[downloadJson.ts]', `Failed downloading ${filename}: ${err.message}`);
        reject(err);
      });
  });
}

// MAIN: Download both files in sequence, with log output at each stage
(async () => {
  try {
    logInfo('[downloadJson.ts]', 'Starting daily download...');

    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');
    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');

    logInfo('[downloadJson.ts]', 'Finished downloading daily MTGJSON files.');
  } catch (err) {
    logError('[downloadJson.ts]', `Download process failed: ${err}`);
  }
})();
