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
import { writeJsonFile, log, logError } from '../src/utils/jsonHelpers';

const inputPath = path.join(__dirname, '../temp/AllIdentifiers.json');
const outputPath = path.join(__dirname, '../temp/parsedCards.json');

// Interface describing the fields we want to keep for each card
interface ParsedCard {
  uuid: string;
  name: string;
  setCode: string;
  language: string;
  scryfallId?: string;
  purchaseUrls?: Record<string, string>;
}

/**
 * Parses AllIdentifiers.json from MTGJSON and extracts only the English-language cards.
 * Saves a simplified list of card metadata to parsedCards.json.
 */
async function parseCards(): Promise<ParsedCard[]> {
  return new Promise((resolve, reject) => {
    log('Starting parseCards...');

    const parsedCards: ParsedCard[] = [];
    let processed = 0;
    let kept = 0;

    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter: 'data' }),
      streamObject(), // stream key-value pairs inside "data" object
    ]);

    pipeline.on('data', ({ value }) => {
      processed++;

      // Skip non-English printings to reduce unnecessary DB bloat
      if (value.language !== 'English') return;

      const card: ParsedCard = {
        uuid: value.uuid,
        name: value.name,
        setCode: value.setCode,
        language: value.language,
        scryfallId: value.scryfallId,
        purchaseUrls: value.purchaseUrls,
      };

      parsedCards.push(card);
      kept++;
    });

    pipeline.on('end', async () => {
      try {
        log(`Finished. Processed ${processed}, kept ${kept}`);
        await writeJsonFile(outputPath, parsedCards, true);
        resolve(parsedCards);
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
