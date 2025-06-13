/**
 * Goblin Bookie Sync Pipeline – NDJSON Sorter
 *
 * What this does:
 * Takes a newline-delimited JSON (NDJSON) file, loads each line into memory,
 * sorts them alphabetically by UUID, and writes them back out to a new file.
 *
 * Why we need this:
 * - The merge step later requires both `parsedCards.ndjson` and `parsedPrices.ndjson`
 *   to be sorted by UUID so we can do a linear merge (no lookups or index building).
 * - Sorting in memory is fast and easy since we’re working with pre-filtered datasets
 *   that are under ~1GB and line-by-line NDJSON format.
 *
 * Streaming vs memory tradeoff:
 * - This script **does** load everything into memory (one line = one object).
 * - If this becomes a problem later (super rare), we could switch to an external sort.
 * - For now, it’s fast and stable enough to run inside Render’s 2GB RAM limit.
 *
 * Error handling:
 * - Any lines that fail to parse as JSON are logged and skipped.
 * - Logs total processed vs failed so we can catch corrupt input early.
 *
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

  // Load and parse each line – invalid JSON gets logged and skipped
  for await (const line of rl) {
    try {
      lines.push(JSON.parse(line));
      total++;
    } catch (err) {
      failed++;
      logError(`Skipping invalid JSON line: ${err}`);
    }
  }

  // Sort by UUID (used as join key later)
  lines.sort((a, b) => a.uuid.localeCompare(b.uuid));

  // Write sorted output line-by-line
  const writer = fs.createWriteStream(outputPath, 'utf-8');
  for (const item of lines) writer.write(JSON.stringify(item) + '\n');

  writer.end();
  await waitForStreamFinish(writer);

  log(`Finished sort: ${total} items sorted, ${failed} skipped due to parse errors`);
}

// Entry point – allows command-line execution
if (require.main === module) {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    console.error('Usage: ts-node sortNdjson.ts <inputPath> <outputPath>');
    process.exit(1);
  }

  sortNdjson(inputPath, outputPath).catch((err) => {
    logError(`sortNdjson failed: ${err}`);
    process.exit(1);
  });
}
