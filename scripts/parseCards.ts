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
      streamObject(),
    ]);

    pipeline.on('data', ({ value }) => {
      processed++;

      // Only keep English-language printings
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
