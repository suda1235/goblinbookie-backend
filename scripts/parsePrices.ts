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

import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const cardsPath = path.join(__dirname, '../temp/parsedCards.json');
const pricesPath = path.join(__dirname, '../temp/AllPrices.json');
const outputPath = path.join(__dirname, '../temp/parsedPrices.json');

// Current date string used to extract today's price (e.g., "2025-06-08")
const today = new Date().toISOString().split('T')[0];

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

async function parsePrices(): Promise<void> {
  log('Starting parsePrices...');

  const parsedCardsRaw = await fs.promises.readFile(cardsPath, 'utf8');
  const parsedCards = JSON.parse(parsedCardsRaw) as { uuid: string }[];
  const targetUuids = new Set(parsedCards.map((c) => c.uuid)); // used to skip irrelevant UUIDs

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
      streamObject(), // each key is a UUID
    ]);

    pipeline.on('data', ({ key, value }) => {
      processed++;
      const uuid = key;
      if (!targetUuids.has(uuid)) return;

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
            if (!finishData || !finishData[today]) continue;

            // Preserve MTGJSON date structure
            points[finish] = {
              [today]: finishData[today],
            };
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
