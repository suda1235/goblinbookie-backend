/**
 * Card Metadata Parser
 *
 * This script processes `AllIdentifiers.json` from MTGJSON and extracts only English-language cards.
 *
 * It outputs a simplified array of card metadata objects to `parsedCards.json`, including:
 * - uuid (MTGJSON's unique card ID)
 * - name (card name)
 * - setCode (short set identifier)
 * - language (filtered to only 'English')
 * - scryfallId (used for a seperate API to get images of the cards, will use this key later)
 * - purchaseUrls (vendor links)
 *
 * Why this matters:
 * - It defines the master list of which cards we care about for pricing
 * - This output is used as the foundation for merging with price data later
 *
 * Efficiency:
 * - Uses stream-based JSON parsing to handle large MTGJSON files safely
 * - Keeps memory usage low even with 100k+ entries
 */

import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const inputPath = path.join(__dirname, '../temp/AllIdentifiers.json');
const outputPath = path.join(__dirname, '../temp/parsedCards.json');

interface ParsedCard {
  uuid: string;
  name: string;
  setCode: string;
  language: string;
  scryfallId?: string;
  purchaseUrls?: Record<string, string>;
}

async function parseCards(): Promise<void> {
  log('Starting parseCards...');

  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  writeStream.write('[\n');

  let processed = 0;
  let kept = 0;
  let first = true;

  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter: 'data' }),
      streamObject(),
    ]);

    pipeline.on('data', ({ value }) => {
      processed++;
      if (value.language !== 'English') return;

      const card: ParsedCard = {
        uuid: value.uuid,
        name: value.name,
        setCode: value.setCode,
        language: value.language,
        scryfallId: value.scryfallId,
        purchaseUrls: value.purchaseUrls,
      };

      const json = JSON.stringify(card);
      if (!first) writeStream.write(',\n');
      writeStream.write(json);
      first = false;
      kept++;
    });

    pipeline.on('end', async () => {
      try {
        writeStream.write('\n]\n');
        writeStream.end();
        await waitForStreamFinish(writeStream);
        log(`Finished. Processed ${processed}, kept ${kept}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    pipeline.on('error', (err) => {
      logError(`parseCards stream failed: ${err}`);
      reject(err);
    });
  });
}

parseCards().catch((err) => {
  logError(`parseCards failed: ${err}`);
});
