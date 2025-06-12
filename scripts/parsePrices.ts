/**
 * Card Metadata Parser
 *
 * What this does:
 * Streams through `AllIdentifiers.json` (the giant list of all card printings),
 * picks out only English-language cards, strips down each object to just what
 * we actually care about, and writes them to `parsedCards.ndjson` (1 per line).
 *
 * Why this matters:
 * - `AllIdentifiers.json` is huge and full of stuff we don’t need (tokens, foreign printings, etc).
 * - We want only English cards for now, with a few key fields to power our app.
 * - We output as NDJSON to keep memory usage low and enable efficient downstream processing.
 *
 * Output format (1 JSON object per line):
 * {
 *   uuid,         // unique ID for this specific card printing
 *   name,         // card name
 *   setCode,      // what set it's from (e.g., “DOM” for Dominaria)
 *   language,     // always “English” here
 *   scryfallId?,  // optional – helps with images or Scryfall links
 *   purchaseUrls? // optional – links to buy this printing
 * }
 */

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

  // Stream + filter only the "data" key, which contains the real card entries
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  // Write the result as newline-delimited JSON
  const writer = fs.createWriteStream(outputPath, 'utf-8');

  pipeline.on('data', ({ value }) => {
    total++;

    // Skip anything that’s not English
    if (value.language !== 'English') return;

    // Skip if we're missing critical fields
    if (!value.uuid || !value.name || !value.setCode) return;

    const card = {
      uuid: value.uuid,
      name: value.name,
      setCode: value.setCode,
      language: value.language,
      scryfallId: value.scryfallId, // optional, but useful
      purchaseUrls: value.purchaseUrls, // optional, for linking to vendors
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
