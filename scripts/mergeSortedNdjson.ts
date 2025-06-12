/**
 * Merge Sorted NDJSON
 *
 * This script performs a **memory-safe merge join** between two large, pre-sorted NDJSON files:
 *
 * - cardsSorted.ndjson → Sorted card metadata (uuid, name, set, etc.)
 * - pricesSorted.ndjson → Sorted price data (uuid → prices)
 *
 * It produces:
 * - mergedCards.ndjson → Final NDJSON combining metadata and price info per UUID
 *
 * Why this approach:
 * - We stream both files line-by-line using `readline` to avoid memory exhaustion.
 * - We rely on both files being **pre-sorted by UUID** to enable a linear, efficient merge.
 * - This avoids the need to build a hash map of either file, which would crash on large files.
 *
 * Implementation notes:
 * - Uses `Symbol.asyncIterator` to manually control `readline` consumption.
 * - Compares UUIDs lexicographically to align matching pairs.
 * - Only writes to output when UUIDs match in both files.
 * - Drops unmatched entries (e.g., cards with no price or vice versa).
 * - Uses a shared `waitForStreamFinish()` utility to ensure output is fully flushed.
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

async function mergeSortedNdjson(cardFile: string, priceFile: string, outputFile: string) {
  // Set up line-by-line readers for both sorted input files
  const cardRL = readline.createInterface({ input: fs.createReadStream(cardFile) });
  const priceRL = readline.createInterface({ input: fs.createReadStream(priceFile) });

  // Output writer stream for the final merged NDJSON
  const output = fs.createWriteStream(outputFile, 'utf-8');

  // Manually get async iterators for controlled line reading
  const cardIter = cardRL[Symbol.asyncIterator]();
  const priceIter = priceRL[Symbol.asyncIterator]();

  // Prime both iterators
  let card = await cardIter.next();
  let price = await priceIter.next();

  // Loop through both files until one is exhausted
  while (!card.done && !price.done) {
    const cardObj = JSON.parse(card.value);
    const priceObj = JSON.parse(price.value);

    if (cardObj.uuid < priceObj.uuid) {
      // Card has no matching price yet → advance card pointer
      card = await cardIter.next();
    } else if (priceObj.uuid < cardObj.uuid) {
      // Price has no matching card yet → advance price pointer
      price = await priceIter.next();
    } else {
      // UUIDs match → merge metadata + price info into one object
      output.write(JSON.stringify({ ...cardObj, prices: priceObj.prices }) + '\n');
      card = await cardIter.next();
      price = await priceIter.next();
    }
  }

  // Ensure output file is properly flushed and closed
  output.end();
  await waitForStreamFinish(output);

  log('mergedCards.ndjson created');
}

// Define absolute paths for the input/output files
mergeSortedNdjson(
  path.join(__dirname, '../temp/cardsSorted.ndjson'),
  path.join(__dirname, '../temp/pricesSorted.ndjson'),
  path.join(__dirname, '../temp/mergedCards.ndjson')
).catch((err) => logError(`Merge failed: ${err}`));
