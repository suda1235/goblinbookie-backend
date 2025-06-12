/**
 * Master Runner Script
 *
 * What this does:
 * This script runs the full Goblin Bookie daily sync pipeline, step by step.
 * It downloads fresh data, filters it, parses it, sorts it, merges it, and uploads
 * it all to MongoDB—then cleans up after itself. Basically, it’s the kitchen sink.
 *
 * Why this matters:
 * - This is the script you trigger manually (or via cron) to refresh your database.
 * - It enforces the proper execution order so later steps don’t fail from missing files.
 * - Logs from each step will appear in your console thanks to `stdio: 'inherit'`.
 *
 * Steps in order:
 *  1. Download the raw MTGJSON files (AllIdentifiers, AllPrices)
 *  2. Parse cards → `parsedCards.ndjson`
 *  3. Parse prices → `parsedPrices.ndjson`
 *  4. Sort both NDJSON files by UUID (required for merge)
 *  5. Merge card + price data into `mergedCards.ndjson`
 *  6. Upload to MongoDB (upserts each card by UUID)
 *  7. Clean up temp files (but leave `.keep`)
 *
 * Notes:
 * - `execSync` blocks each step until it finishes. If anything fails, we exit early.
 * - Every script runs using `npx ts-node` to support TypeScript without compiling ahead of time.
 */

import { execSync } from 'child_process';
import path from 'path';

const runScript = (script: string) =>
  execSync(`npx ts-node ${path.join(__dirname, script)}`, { stdio: 'inherit' });

const tempDir = path.join(__dirname, '../temp');

async function runAll() {
  try {
    // STEP 1: Download fresh data from MTGJSON
    runScript('downloadJson.ts');

    // STEP 2: Parse AllIdentifiers.json → parsedCards.ndjson
    runScript('parseCards.ts');

    // STEP 3: Parse AllPrices.json → parsedPrices.ndjson
    runScript('parsePrices.ts');

    // STEP 4: Sort both NDJSON files by UUID (needed for merge join)
    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedCards.ndjson')} ${path.join(tempDir, 'cardsSorted.ndjson')}`
    );
    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedPrices.ndjson')} ${path.join(tempDir, 'pricesSorted.ndjson')}`
    );

    // STEP 5: Merge the two sorted files → mergedCards.ndjson
    runScript('mergeSortedNdjson.ts');

    // STEP 6: Upload final merged data to MongoDB
    runScript('uploadToMongo.ts');

    // STEP 7: Clean up temp NDJSON files (preserve .keep)
    runScript('cleanUp.ts');
  } catch (error) {
    console.error(`Pipeline failed: ${error}`);
    process.exit(1);
  }
}

runAll();
