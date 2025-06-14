/**
 * Parse Card Metadata (AllIdentifiers.json)
 *
 * Purpose:
 * This script processes MTGJSON's AllIdentifiers.json and outputs only the English-language
 * paper card entries with required metadata as NDJSON, one card per line. This makes downstream
 * processing faster, lighter, and more memory efficient.
 *
 * Why we filter:
 * - AllIdentifiers.json contains hundreds of thousands of entries, many of which are not relevant
 *   (non-English, promos, tokens, digital-only, or missing required fields).
 * - We want to restrict Goblin Bookie to just English paper cards for MVP and keep only the fields needed.
 * - Writing as NDJSON (newline-delimited JSON) enables efficient streaming and later merge operations.
 *
 * Implementation details:
 * - Streams the large JSON input using `stream-json` to avoid high memory use.
 * - Filters out non-English entries and any card missing required fields (uuid, name, setCode).
 * - Writes one filtered JSON object per line to the output NDJSON file.
 *
 * Output:
 *   - One line per valid card with the following fields:
 *     uuid, name, setCode, language, scryfallId (optional), purchaseUrls (optional)
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

/**
 * Main function: Streams AllIdentifiers.json, filters for English-language paper cards with
 * required metadata, and writes the result as NDJSON (one JSON object per line).
 */
async function parseCardsNDJSON() {
  log('Starting parseCards from AllIdentifiers.json');

  let total = 0;
  let kept = 0;

  // Set up streaming pipeline to access the "data" field in AllIdentifiers.json
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  // Set up the NDJSON output writer
  const writer = fs.createWriteStream(outputPath, 'utf-8');

  // Process each card entry from the stream
  pipeline.on('data', ({ value }) => {
    total++;

    // Skip cards that are not English-language
    if (value.language !== 'English') return;

    // Skip any card missing required fields
    if (!value.uuid || !value.name || !value.setCode) return;

    // Create minimal card object with only fields needed by Goblin Bookie
    const card = {
      uuid: value.uuid,
      name: value.name,
      setCode: value.setCode,
      language: value.language,
      scryfallId: value.scryfallId, // Optional, for linking to Scryfall
      purchaseUrls: value.purchaseUrls, // Optional, for buy links
    };

    writer.write(JSON.stringify(card) + '\n');
    kept++;
  });

  // When the stream ends, finish writing and log the result
  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    log(`parseCards complete: ${total} total entries, ${kept} cards written`);
  });

  // On stream error, log and report failure
  pipeline.on('error', (err) => logError(`parseCards stream failed: ${err}`));
}

// Start the parsing process
parseCardsNDJSON();
