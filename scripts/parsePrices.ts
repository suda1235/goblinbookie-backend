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

type ParsedCardPrice = {
  uuid: string;
  prices: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>>;
};

/**
 * Streams AllPrices.json and writes matched price data directly to parsedPrices.json.
 * This avoids memory limits by not storing all price entries in RAM.
 */
async function parsePrices(): Promise<void> {
  log('Starting parsePrices...');

  const parsedCardsRaw = await fs.promises.readFile(cardsPath, 'utf8');
  const parsedCards = JSON.parse(parsedCardsRaw) as { uuid: string }[];
  const targetUuids = new Set(parsedCards.map((c) => c.uuid));

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

      if (!targetUuids.has(uuid)) return;
      const paperPrices = value?.paper;
      if (!paperPrices) return;

      const { tcgplayer, cardkingdom, cardmarket } = paperPrices;

      const entry: ParsedCardPrice = {
        uuid,
        prices: { tcgplayer, cardkingdom, cardmarket },
      };

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
