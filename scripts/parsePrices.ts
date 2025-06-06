import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { writeJsonFile, log, logError } from '../src/utils/jsonHelpers';

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

type PriceFormats = {
  mtgo?: Record<'cardhoarder', PriceList>;
  paper?: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>>;
};

type ParsedCardPrice = {
  uuid: string;
  prices: Partial<Record<'tcgplayer' | 'cardkingdom' | 'cardmarket', PriceList>>;
};

const cardsPath = path.join(__dirname, '../data/parsedCards.json');
const pricesPath = path.join(__dirname, '../temp/AllPrices.json');
const outputPath = path.join(__dirname, '../data/parsedPrices.json');

async function parsePricesFile(): Promise<void> {
  const parsedCardsRaw = await fs.promises.readFile(cardsPath, 'utf8');
  const parsedCards = JSON.parse(parsedCardsRaw) as { uuid: string }[];

  const targetUuids = new Set(parsedCards.map((c) => c.uuid));
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  writeStream.write('[\n');
  let first = true;

  return new Promise((resolve, reject) => {
    let processed = 0;
    let kept = 0;

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

      const paperPrices: PriceFormats['paper'] = value?.paper;
      if (!paperPrices) return;

      const { tcgplayer, cardkingdom, cardmarket } = paperPrices;

      const entry: ParsedCardPrice = {
        uuid,
        prices: { tcgplayer, cardkingdom, cardmarket },
      };

      const json = JSON.stringify(entry, null, 2);

      if (!first) {
        writeStream.write(',\n');
      }
      writeStream.write(json);
      first = false;

      kept++;
      if (kept <= 3) {
        log(`Matched ${uuid}`);
        console.dir({ tcgplayer, cardkingdom, cardmarket }, { depth: 2 });
      }
    });

    pipeline.on('end', async () => {
      try {
        log(`Finished. Processed ${processed}, kept ${kept}`);
        writeStream.write('\n]\n');
        writeStream.end();
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    pipeline.on('error', (err) => {
      logError(`Pricing parsing failed: ${err}`);
      reject(err);
    });
  });
}

parsePricesFile().catch((err) => {
  logError(`parsePricesFile failed: ${err}`);
});
