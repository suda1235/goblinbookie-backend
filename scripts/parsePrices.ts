/**
 *  Card Price Parser
 *
 * This script extracts only today's paper price data from the large `AllPrices.json` MTGJSON file.
 * It matches against known card UUIDs from `parsedCards.json` and outputs cleaned pricing data
 * in `parsedPrices.json`, preserving the nested structure by:
 *
 * - Keeping prices organized by vendor (TCGplayer, Card Kingdom, Cardmarket)
 * - Preserving MTGJSON's structure of date-keyed values inside `normal`, `foil`, `etched` subfields
 *
 * Why this matters:
 * - Keeps historical formatting intact for later upload to MongoDB
 * - Filters out all non-paper data and unused vendors
 * - Ensures that we only keep price info for cards we care about
 *
 * Implementation notes:
 * - Uses `stream-json` to keep memory usage low while handling 100k+ entries
 * - Automatically detects today’s date to extract just the latest price points
 */

/**
 * Stream-safe Price Parser
 *
 * Same logic as before, but fully streaming – even the UUID lookup.
 * Will only retain matched prices from known UUIDs.
 */

import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const cardsPath = path.join(__dirname, '../temp/parsedCards.json');
const pricesPath = path.join(__dirname, '../temp/AllPrices.json');
const outputPath = path.join(__dirname, '../temp/parsedPrices.json');

// Set the date to filter on – use dynamic or fixed for testing
const today = '2025-06-07';
//const today = new Date().toISOString().split('T')[0];

type PricePoints = {
  etched?: Record<string, number>;
  foil?: Record<string, number>;
  normal?: Record<string, number>;
};

type PriceList = {
  buylist?: PricePoints;
  currency?: string;
  retail?: PricePoints;
};

type ParsedCardPrice = {
  uuid: string;
  prices: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>>;
};

export async function parsePrices(): Promise<void> {
  log('Starting parsePrices...');

  // Step 1: Stream card UUIDs into a Set
  const knownUUIDs = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const cardStream = chain([fs.createReadStream(cardsPath), parser(), streamArray()]);

    cardStream.on('data', ({ value }) => {
      knownUUIDs.add(value.uuid);
    });

    cardStream.on('end', () => resolve());
    cardStream.on('error', (err) => {
      logError(`Failed to stream card UUIDs: ${err}`);
      reject(err);
    });
  });

  // Step 2: Stream the price data and filter as we go
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  writeStream.write('[\n');

  return new Promise((resolve, reject) => {
    let processed = 0;
    let kept = 0;
    let first = true;

    const pipeline = chain([
      fs.createReadStream(pricesPath),
      parser(),
      pick({ filter: 'data' }),
      streamObject(),
    ]);

    pipeline.on('data', ({ key, value }) => {
      processed++;
      const uuid = key;
      if (!knownUUIDs.has(uuid)) return;

      const paper = value?.paper;
      if (!paper) return;

      const prices: ParsedCardPrice['prices'] = {};

      for (const vendor of ['tcgplayer', 'cardkingdom', 'cardmarket']) {
        const vendorData = paper[vendor];
        if (!vendorData) continue;

        const priceList: PriceList = {};

        for (const type of ['retail', 'buylist'] as const) {
          const typeData = vendorData[type];
          if (!typeData) continue;

          const points: PricePoints = {};

          for (const finish of ['normal', 'foil', 'etched'] as const) {
            const finishData = typeData[finish];
            if (!finishData || typeof finishData !== 'object') continue;

            const priceToday = finishData[today];
            if (priceToday !== undefined) {
              points[finish] = { [today]: priceToday };
            }
          }

          if (Object.keys(points).length > 0) {
            priceList[type] = points;
          }
        }

        if (Object.keys(priceList).length > 0) {
          prices[vendor as keyof ParsedCardPrice['prices']] = priceList;
        }
      }

      if (Object.keys(prices).length === 0) return;

      const entry: ParsedCardPrice = { uuid, prices };
      const json = JSON.stringify(entry);
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
      logError(`parsePrices stream failed: ${err}`);
      reject(err);
    });
  });
}

parsePrices().catch((err) => {
  logError(`parsePrices failed: ${err}`);
});
