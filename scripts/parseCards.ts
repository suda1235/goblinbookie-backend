/**
 * Parse Card Metadata (AllIdentifiers.json)
 *
 * This script extracts only the relevant English-language card entries from MTGJSON’s
 * `AllIdentifiers.json`, and writes them line-by-line to `parsedCards.ndjson`.
 *
 * Why we need this:
 * - The full `AllIdentifiers.json` contains hundreds of thousands of entries, including
 *   multiple languages, promos, tokens, and digital-only printings.
 * - We only care about English-language paper cards with valid metadata for Goblin Bookie.
 * - NDJSON output format allows for memory-efficient merging later.
 *
 * Streaming + Filtering Benefits:
 * - The pipeline streams the input file using `stream-json` to avoid memory spikes.
 * - Non-English cards and incomplete metadata are skipped to reduce downstream data bloat.
 * - Output is written line-by-line to enable massive-scale processing.
 *
 * Output: One valid JSON object per line with only the fields needed for Goblin Bookie:
 *   - uuid, name, setCode, language, scryfallId (optional), purchaseUrls (optional)
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

  // Set up streaming parser pipeline to access "data" field in AllIdentifiers.json
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  // Write output as NDJSON (newline-delimited JSON)
  const writer = fs.createWriteStream(outputPath, 'utf-8');

  // Main processing loop: filters + transforms each card entry
  pipeline.on('data', ({ value }) => {
    total++;

    // Skip non-English entries – we only support English for MVP
    if (value.language !== 'English') return;

    // Skip entries missing required fields (uuid, name, setCode)
    if (!value.uuid || !value.name || !value.setCode) return;

    // Construct a slimmed-down version of the card object for Goblin Bookie
    const card = {
      uuid: value.uuid,
      name: value.name,
      setCode: value.setCode,
      language: value.language,
      scryfallId: value.scryfallId, // Optional – used for linking or display
      purchaseUrls: value.purchaseUrls, // Optional – used for buy links
    };

    writer.write(JSON.stringify(card) + '\n');
    kept++;
  });

  // On successful stream end, finalize the file and log summary
  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    log(`parseCards complete: ${total} total entries, ${kept} cards written`);
  });

  // On stream error, report failure
  pipeline.on('error', (err) => logError(`parseCards stream failed: ${err}`));
}

// Start parsing process
parseCardsNDJSON();
