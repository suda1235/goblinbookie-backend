/**
 * Goblin Bookie – Card Sorter Script
 *
 * PURPOSE:
 *   Sorts the parsed cards NDJSON file by UUID to prepare for efficient merging and database upload.
 *   Ensures that card data is consistently ordered, which is critical for line-by-line streaming merges and updates.
 */

import path from 'path';
import sortNdjson from '../src/utils/sortNdjson';

const input = path.join(__dirname, '../temp/parsedCards.ndjson');
const output = path.join(__dirname, '../temp/cardsSorted.ndjson');

sortNdjson(input, output)
  .then(() => console.log('[sortCards.ts] Cards sorted successfully.'))
  .catch((err) => {
    console.error('[sortCards.ts] Failed to sort cards:', err);
    process.exit(1);
  });
