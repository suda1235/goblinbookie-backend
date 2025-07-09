/**
 * Goblin Bookie – NDJSON Sorter
 *
 * PURPOSE:
 *   Reads a newline-delimited JSON (NDJSON) file, parses each line as a JSON object,
 *   sorts all objects alphabetically by their `uuid` field, and writes the sorted objects
 *   back out to a new NDJSON file.
 *
 * CONTEXT:
 *   - Both parsedCards.ndjson and parsedPrices.ndjson must be sorted by UUID before the merge step,
 *     so the merge can happen efficiently as a linear, streaming operation.
 *   - Sorting is done in memory (safe for pre-filtered files <1GB, as on Render's 2GB limit).
 *
 * ERROR HANDLING:
 *   - Lines that cannot be parsed as valid JSON are logged and skipped (no crash).
 *   - Summary logs total, skipped, and output path at the end.
 */

import fs from 'fs';
import readline from 'readline';
import { logInfo, logError, waitForStreamFinish } from './jsonHelpers';

async function sortNdjson(inputPath: string, outputPath: string): Promise<void> {
  logInfo('[sortNdjson.ts]', `Starting sort for ${inputPath}`);
  const lines: any[] = [];
  let total = 0;
  let failed = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      lines.push(JSON.parse(line));
      total++;
    } catch (err) {
      failed++;
      logError('[sortNdjson.ts]', `Skipping invalid JSON line: ${err}`);
    }
  }

  lines.sort((a, b) => a.uuid.localeCompare(b.uuid));

  const writer = fs.createWriteStream(outputPath, 'utf-8');
  for (const item of lines) writer.write(JSON.stringify(item) + '\n');

  writer.end();
  await waitForStreamFinish(writer);

  logInfo(
    '[sortNdjson.ts]',
    `Finished sort: ${total} items sorted, ${failed} skipped, output: ${outputPath}`
  );
}

export default sortNdjson;
