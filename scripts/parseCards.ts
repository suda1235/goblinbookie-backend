/**
 * Goblin Bookie – Parse Card Metadata (AllIdentifiers.json)
 *
 * PURPOSE:
 *   Streams MTGJSON's AllIdentifiers.json and outputs only English-language, paper card entries
 *   (with required metadata) as NDJSON—one card per line. This filtering step dramatically reduces
 *   the dataset size for downstream processing and memory efficiency.
 *
 * CONTEXT:
 *   - AllIdentifiers.json is massive and includes digital cards, non-English cards, promos, tokens, etc.
 *   - We want only English, paper cards with uuid, name, and setCode for Goblin Bookie MVP.
 *   - Output as NDJSON (newline-delimited) enables safe, memory-efficient streaming in all later scripts.
 *   - All logs use [parseCards.ts] as a tag for easy tracing/debugging in /logs/sync.log.
 *
 * IMPLEMENTATION DETAILS:
 *   - Uses stream-json for memory-efficient, event-based processing of large JSON.
 *   - Filters out any entry that isn't a standard English paper card or is missing key metadata.
 *   - Writes results as NDJSON (one valid card per line).
 *   - Logs total vs. kept counts for quick health check.
 */

import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { logInfo, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

// Define input/output paths (relative to this script)
const inputPath = path.join(__dirname, '../temp/AllIdentifiers.json');
const outputPath = path.join(__dirname, '../temp/parsedCards.ndjson');

/**
 * Streams AllIdentifiers.json, filters for English paper cards with required fields,
 * writes one minimal JSON object per line (NDJSON), and logs results.
 */
async function parseCardsNDJSON() {
  logInfo('[parseCards.ts]', 'Starting parseCards from AllIdentifiers.json');

  let total = 0;
  let kept = 0;

  // Streaming pipeline: read → parse → pick data → iterate objects
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: 'data' }),
    streamObject(),
  ]);

  // NDJSON output writer
  const writer = fs.createWriteStream(outputPath, 'utf-8');

  // Main streaming handler: only keep English cards with all key fields
  pipeline.on('data', ({ value }) => {
    total++;
    if (value.language !== 'English') return; // Only English
    if (!value.uuid || !value.name || !value.setCode) return; // Only cards with essentials

    // Minimal card object: only required fields (+ optional Scryfall/purchaseUrls for downstream)
    const card = {
      uuid: value.uuid,
      name: value.name,
      setCode: value.setCode,
      language: value.language,
      scryfallId: value.identifiers?.scryfallId, // Optional: for Scryfall linking
      purchaseUrls: value.purchaseUrls, // Optional: for buy links
    };

    writer.write(JSON.stringify(card) + '\n');
    kept++;
  });

  // When finished, flush and log stats
  pipeline.on('end', async () => {
    writer.end();
    await waitForStreamFinish(writer);
    logInfo(
      '[parseCards.ts]',
      `parseCards complete: ${total} total entries, ${kept} cards written`
    );
  });

  // Log any stream errors with full context
  pipeline.on('error', (err) => logError('[parseCards.ts]', `Stream failed: ${err}`));
}

// Start the process when the script runs
parseCardsNDJSON();
