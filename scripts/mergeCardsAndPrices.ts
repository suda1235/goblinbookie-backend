/**
 * Price Merge Script
 *
 * This script merges card metadata with matching price blobs using the card UUID.
 *
 * Input files:
 * - parsedCards.json: result of parseCards.ts, contains trimmed card info (English only)
 * - parsedPrices.json: result of parsePrices.ts, contains only today's valid price data
 *
 * Output file:
 * - mergedCards.json: result of merging metadata and prices into a single file for DB upload
 *
 * Stream-based processing ensures memory safety for large datasets (~100k+ cards).
 * We skip cards without valid price data to avoid inserting incomplete entries.
 */

import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const cardsPath = path.join(__dirname, '../temp/parsedCards.json');
const pricesPath = path.join(__dirname, '../temp/parsedPrices.json');
const outputPath = path.join(__dirname, '../temp/mergedCards.json');

// Type declarations to enforce structure of both input and merged files
type Card = {
  uuid: string;
  name: string;
  setCode: string;
  language: string;
  scryfallId?: string;
  purchaseUrls?: Record<string, string>;
};

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

type PriceBlob = {
  uuid: string;
  prices: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>> | undefined;
};

// Skip cards with completely empty or malformed price data
function hasValidPrices(prices: PriceBlob['prices']): boolean {
  if (!prices || typeof prices !== 'object') return false;

  for (const vendor of Object.values(prices)) {
    if (!vendor) continue;

    for (const channel of ['retail', 'buylist'] as const) {
      const pricePoints = vendor[channel];
      if (!pricePoints) continue;

      for (const finish of ['normal', 'foil', 'etched'] as const) {
        const blob = pricePoints[finish];
        if (blob && typeof blob === 'object' && Object.keys(blob).length > 0) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Streams parsedPrices.json and joins entries to parsedCards by UUID,
 * outputting mergedCards.json for DB ingestion.
 */
async function mergeCardsAndPrices(): Promise<void> {
  try {
    log('Starting mergeCardsAndPrices (streamed)...');

    // Load parsed card metadata into memory (small enough to fit)
    const cardsRaw = await fs.promises.readFile(cardsPath, 'utf-8');
    const cards: Card[] = JSON.parse(cardsRaw);
    const cardMap = new Map(cards.map((card) => [card.uuid, card]));

    const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
    writeStream.write('[\n');

    let first = true;
    let matched = 0;

    // Stream price data from file (to avoid memory crash)
    const pipeline = chain([fs.createReadStream(pricesPath), parser(), streamArray()]);

    pipeline.on('data', ({ value }: { value: PriceBlob }) => {
      const card = cardMap.get(value.uuid);
      if (!card || !hasValidPrices(value.prices)) return;

      const merged = {
        ...card,
        prices: value.prices,
      };

      const line = JSON.stringify(merged);
      if (!first) writeStream.write(',\n');
      writeStream.write(line);
      first = false;
      matched++;
    });

    pipeline.on('end', async () => {
      writeStream.write('\n]\n');
      writeStream.end();
      await waitForStreamFinish(writeStream);
      log(`Finished merging ${matched} cards into ${outputPath}`);
    });

    pipeline.on('error', (err) => {
      logError(`mergeCardsAndPrices stream failed: ${err}`);
    });
  } catch (err) {
    logError(`mergeCardsAndPrices failed: ${err}`);
  }
}

mergeCardsAndPrices();
