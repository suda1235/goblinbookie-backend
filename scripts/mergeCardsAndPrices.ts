import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

// File paths
const cardsPath = path.join(__dirname, '../temp/parsedCards.json');
const pricesPath = path.join(__dirname, '../temp/parsedPrices.json');
const outputPath = path.join(__dirname, '../temp/mergedCards.json');

// Types for card and price format
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
  currency: string;
  retail?: PricePoints;
};

type PriceBlob = {
  uuid: string;
  prices: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>>;
};

/**
 * Merges parsed card metadata with matching price data.
 * Outputs mergedCards.json in compact format for MongoDB upload.
 */
async function mergeCardsAndPrices(): Promise<void> {
  try {
    log('Starting mergeCardsAndPrices...');

    // Load all parsed card metadata into memory
    const cardsRaw = await fs.promises.readFile(cardsPath, 'utf-8');
    const cards: Card[] = JSON.parse(cardsRaw);
    const cardMap = new Map(cards.map((card) => [card.uuid, card]));

    // Prepare write stream
    const stream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
    stream.write('[\n');

    let first = true;
    let matched = 0;

    // Stream parsedPrices.json and merge with card data
    const pipeline = chain([fs.createReadStream(pricesPath), parser(), streamArray()]);

    pipeline.on('data', ({ value }: { value: PriceBlob }) => {
      const card = cardMap.get(value.uuid);
      if (!card) return;

      const merged = {
        ...card,
        prices: value.prices,
      };

      const line = JSON.stringify(merged);

      if (!first) stream.write(',\n');
      stream.write(line);
      first = false;

      matched++;
    });

    pipeline.on('end', async () => {
      stream.write('\n]\n');
      stream.end();
      await waitForStreamFinish(stream);
      log(`Finished. Merged ${matched} cards into ${outputPath}`);
    });

    pipeline.on('error', (err) => {
      logError(`mergeCardsAndPrices stream failed: ${err}`);
    });
  } catch (err) {
    logError(`mergeCardsAndPrices failed: ${err}`);
  }
}

mergeCardsAndPrices();
