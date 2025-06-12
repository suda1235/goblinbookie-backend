import https from 'https';
import fs from 'fs';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';

const destinationDir = path.join(__dirname, '../temp');

async function downloadFile(url: string, filename: string) {
  return new Promise<void>((resolve, reject) => {
    const filePath = path.join(destinationDir, filename);
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed: ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () =>
          file.close(() => {
            log(`Downloaded ${filename}`);
            resolve();
          })
        );
      })
      .on('error', (err) => {
        fs.unlink(filePath, () => {});
        logError(`Failed downloading ${filename}: ${err.message}`);
        reject(err);
      });
  });
}

(async () => {
  try {
    log(`Starting daily download...`);
    await downloadFile('https://mtgjson.com/api/v5/AllIdentifiers.json', 'AllIdentifiers.json');
    await downloadFile('https://mtgjson.com/api/v5/AllPrices.json', 'AllPrices.json');
    log('Finished downloading daily MTGJSON files.');
  } catch (err) {
    logError(`Download process failed: ${err}`);
  }
})();
