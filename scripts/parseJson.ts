import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { writeJsonFile, log, logError } from '../src/utils/jsonHelpers';

const inputPath = path.join(__dirname, '../temp/AllIdentifiers.json');
const outputPath = path.join(__dirname, '../data/parsedCards.json');

interface ParsedCard {
  uuid: string;
  name: string;
  setCode: string;
  language: string;
  scryfallId?: string;
  purchaseUrls?: Record<string, string>;
}

// main function for parsing
async function parseIdentifiersFile(): Promise<ParsedCard[]> {
  return new Promise((resolve, reject) => {
    const parsedCards: ParsedCard[] = [];

    let processed = 0;
    let kept = 0;

    const pipeline = chain([
      fs.createReadStream(inputPath),
      parser(),
      pick({ filter: 'data' }),
      streamObject(),
    ]);

    pipeline.on('data', ({ key, value }) => {
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

      parsedCards.push(card);
      kept++;
    });

    pipeline.on('end', async () => {
      try {
        log(`Streamed ${processed} cards, kept ${kept}`);
        await writeJsonFile(outputPath, parsedCards);
        resolve(parsedCards);
      } catch (err) {
        reject(err);
      }
    });

    pipeline.on('error', (err) => {
      logError(`Pipeline failed: ${err}`);
      reject(err);
    });
  });
}

parseIdentifiersFile().catch((err) => {
  logError(`ParsedIdentifiersFile Failed: ${err}`);
});
