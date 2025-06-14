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
