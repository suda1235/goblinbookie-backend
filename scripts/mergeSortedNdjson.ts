/**
 * Goblin Bookie – Merge Sorted NDJSON
 *
 * PURPOSE:
 *   Memory-efficiently merges two large, sorted NDJSON files:
 *     - cardsSorted.ndjson: Sorted card metadata (uuid, name, setCode, etc.)
 *     - pricesSorted.ndjson: Sorted price data (uuid → prices object)
 *   into:
 *     - mergedCards.ndjson: Each line is a merged object combining metadata and prices for each uuid.
 *
 * CONTEXT:
 *   - This script is the critical “join” step in the daily sync pipeline.
 *   - Both input files are sorted by uuid, enabling a single linear pass (no in-memory maps, very low RAM).
 *   - This approach ensures the pipeline can handle huge datasets even on low-memory environments (<2GB).
 *
 * IMPLEMENTATION DETAILS:
 *   - Uses Node's readline + async iterators for true line-by-line streaming.
 *   - Only outputs lines for uuids present in *both* files (cards *and* prices).
 *   - All file paths are relative to the current script.
 *   - All writes are streamed; output is flushed using waitForStreamFinish before exit.
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { logInfo, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

/**
 * Merges two pre-sorted NDJSON files by uuid using a streaming, lockstep merge.
 *
 * @param cardFile {string} – Path to sorted card metadata NDJSON
 * @param priceFile {string} – Path to sorted price NDJSON
 * @param outputFile {string} – Path to write merged NDJSON output
 */
async function mergeSortedNdjson(cardFile: string, priceFile: string, outputFile: string) {
  // Stream both input files line by line
  const cardRL = readline.createInterface({ input: fs.createReadStream(cardFile) });
  const priceRL = readline.createInterface({ input: fs.createReadStream(priceFile) });

  // Output stream for merged result
  const output = fs.createWriteStream(outputFile, 'utf-8');

  // Async iterators let us read lines one at a time (no memory bloat)
  const cardIter = cardRL[Symbol.asyncIterator]();
  const priceIter = priceRL[Symbol.asyncIterator]();

  // Advance both iterators to their first lines
  let card = await cardIter.next();
  let price = await priceIter.next();

  // Merge join: walk through both files in lockstep, writing matches
  while (!card.done && !price.done) {
    const cardObj = JSON.parse(card.value);
    const priceObj = JSON.parse(price.value);

    if (cardObj.uuid < priceObj.uuid) {
      // Card UUID is behind price UUID; advance card stream
      card = await cardIter.next();
    } else if (priceObj.uuid < cardObj.uuid) {
      // Price UUID is behind card UUID; advance price stream
      price = await priceIter.next();
    } else {
      // UUIDs match: merge and write to output as a single line
      output.write(JSON.stringify({ ...cardObj, prices: priceObj.prices }) + '\n');
      card = await cardIter.next();
      price = await priceIter.next();
    }
  }

  // Flush output to disk before exit (guaranteed by helper)
  output.end();
  await waitForStreamFinish(output);

  logInfo('[mergeSortedNdjson.ts]', 'mergedCards.ndjson created');
}

// Start the merge process with hard-coded relative paths
mergeSortedNdjson(
  path.join(__dirname, '../temp/cardsSorted.ndjson'),
  path.join(__dirname, '../temp/pricesSorted.ndjson'),
  path.join(__dirname, '../temp/mergedCards.ndjson')
).catch((err) => logError('[mergeSortedNdjson.ts]', `Merge failed: ${err}`));
