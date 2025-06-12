import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

const inputPath = path.join(__dirname, '../temp/AllIdentifiers.json');
const outputPath = path.join(__dirname, '../temp/parsedCards.ndjson');

async function parseCardsNDJSON() {
  log('Starting parseCards from AllIdentifiers.json');

  let total = 0;
  let kept = 0;

  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  const writer = fs.createWriteStream(outputPath, 'utf-8');

  pipeline.on('data', ({ value }) => {
    total++;

    // Ensure it's English
    if (value.language !== 'English') return;

    // Validate required fields
    if (!value.uuid || !value.name || !value.setCode) return;

    const card = {
      uuid: value.uuid,
      name: value.name,
      setCode: value.setCode,
      language: value.language,
      scryfallId: value.scryfallId,
      purchaseUrls: value.purchaseUrls,
    };

    writer.write(JSON.stringify(card) + '\n');
    kept++;
  });

  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    log(`parseCards complete: ${total} total entries, ${kept} cards written`);
  });

  pipeline.on('error', (err) => logError(`parseCards stream failed: ${err}`));
}

parseCardsNDJSON();
