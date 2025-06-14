/**
 * NDJSON Sorter
 *
 * Purpose:
 * This script reads a newline-delimited JSON (NDJSON) file, parses each line as a JSON object,
 * sorts all objects alphabetically by their `uuid` field, and writes the sorted objects back out
 * to a new NDJSON file.
 *
 * Why sorting matters:
 * - Both `parsedCards.ndjson` and `parsedPrices.ndjson` must be sorted by UUID before the merge step,
 *   enabling an efficient linear (streamed) merge without building an index in memory.
 * - Sorting in memory is suitable here because pre-filtered NDJSON files are typically well under 1GB,
 *   allowing for fast and simple processing within a 2GB RAM limit (e.g., on Render).
 *
 * Memory usage note:
 * - This script loads all lines into memory before sorting. If files become too large in the future,
 *   consider switching to an external sort (e.g., Unix `sort` or a streaming algorithm).
 *
 * Error handling:
 * - Lines that cannot be parsed as valid JSON are logged and skipped.
 * - At the end, the script logs how many lines were processed successfully and how many failed.
 *
 * Usage:
 *   ts-node sortNdjson.ts <inputPath> <outputPath>
 *   Example: ts-node sortNdjson.ts data/parsedCards.ndjson data/parsedCards.sorted.ndjson
 */

import fs from 'fs';
import readline from 'readline';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

async function sortNdjson(inputPath: string, outputPath: string): Promise<void> {
  log(`Starting sort for ${inputPath}`);

  const lines: any[] = [];
  let total = 0;
  let failed = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  // Parse each NDJSON line and add to array. Log and skip invalid JSON lines.
  for await (const line of rl) {
    try {
      lines.push(JSON.parse(line));
      total++;
    } catch (err) {
      failed++;
      logError(`Skipping invalid JSON line: ${err}`);
    }
  }

  // Sort all objects by their `uuid` string (used as a join key in merge step)
  lines.sort((a, b) => a.uuid.localeCompare(b.uuid));

  // Write sorted objects to output NDJSON file, one JSON object per line
  const writer = fs.createWriteStream(outputPath, 'utf-8');
  for (const item of lines) writer.write(JSON.stringify(item) + '\n');

  writer.end();
  await waitForStreamFinish(writer);

  log(`Finished sort: ${total} items sorted, ${failed} skipped due to parse errors`);
}
