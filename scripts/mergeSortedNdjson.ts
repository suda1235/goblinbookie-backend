/**
 * Merge Sorted NDJSON
 *
 * Purpose:
 * This script performs a memory-efficient merge join of two large, pre-sorted NDJSON files:
 *
 * - cardsSorted.ndjson: Sorted card metadata (uuid, name, setCode, etc.)
 * - pricesSorted.ndjson: Sorted price data (uuid → prices object)
 *
 * Output:
 * - mergedCards.ndjson: Each line is a merged JSON object combining card metadata and its corresponding prices,
 *   matched by UUID.
 *
 * Why use this approach:
 * - Both input files are sorted by UUID, so we can process them in a single linear pass.
 * - We use readline streams and async iterators to handle one line at a time, keeping memory usage very low.
 * - Avoids the need to build a map or load an entire file into memory, which would be unsafe for large datasets.
 *
 * Implementation details:
 * - Each stream is advanced independently, comparing UUIDs lexicographically to find matching pairs.
 * - Only writes output for UUIDs present in both files; unmatched cards or prices are skipped.
 * - Uses a waitForStreamFinish utility to guarantee all output is flushed before exiting.
 */

import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

async function mergeSortedNdjson(cardFile: string, priceFile: string, outputFile: string) {
  // Create readline interfaces to stream both input files line by line
  const cardRL = readline.createInterface({ input: fs.createReadStream(cardFile) });
  const priceRL = readline.createInterface({ input: fs.createReadStream(priceFile) });

  // Create output stream for merged NDJSON result
  const output = fs.createWriteStream(outputFile, 'utf-8');

  // Get async iterators for both input streams
  const cardIter = cardRL[Symbol.asyncIterator]();
  const priceIter = priceRL[Symbol.asyncIterator]();

  // Prime both iterators with their first lines
  let card = await cardIter.next();
  let price = await priceIter.next();

  // Main merge loop: walk through both sorted files in lockstep
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
      // UUIDs match: merge card metadata with price data, write to output
      output.write(JSON.stringify({ ...cardObj, prices: priceObj.prices }) + '\n');
      card = await cardIter.next();
      price = await priceIter.next();
    }
  }

  // Flush and close output file once done
  output.end();
  await waitForStreamFinish(output);

  log('mergedCards.ndjson created');
}

// Define input and output file paths and start the merge process
mergeSortedNdjson(
  path.join(__dirname, '../temp/cardsSorted.ndjson'),
  path.join(__dirname, '../temp/pricesSorted.ndjson'),
  path.join(__dirname, '../temp/mergedCards.ndjson')
).catch((err) => logError(`Merge failed: ${err}`));
