import path from 'path';
import sortNdjson from '../src/utils/sortNdjson';

const input = path.join(__dirname, '../temp/parsedPrices.ndjson');
const output = path.join(__dirname, '../temp/pricesSorted.ndjson');

sortNdjson(input, output)
  .then(() => console.log('[sortPrices.ts] Prices sorted successfully.'))
  .catch((err) => {
    console.error('[sortPrices.ts] Failed to sort prices:', err);
    process.exit(1);
  });
