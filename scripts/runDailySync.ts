/**
 * Master Runner Script
 *
 * Overview:
 * This script orchestrates the entire Goblin Bookie daily sync pipeline by running
 * each data-processing step in sequence. It ensures that all necessary files are created,
 * sorted, and merged correctly, and that your MongoDB database is updated with the latest
 * price history. It also cleans up temporary files at the end.
 *
 * When to use:
 * - Run this script manually or set it as a scheduled cron job to keep your database in sync with MTGJSON.
 * - Guarantees proper step ordering so no part of the pipeline runs with missing or out-of-date input.
 * - All script output and errors are printed directly to your console due to `stdio: 'inherit'`.
 *
 * Pipeline steps:
 *  1. Download raw MTGJSON data files (AllIdentifiers.json, AllPrices.json)
 *  2. Parse card data to produce `parsedCards.ndjson`
 *  3. Parse price data to produce `parsedPrices.ndjson`
 *  4. Sort both NDJSON files by UUID for efficient merging
 *  5. Merge card and price data into `mergedCards.ndjson`
 *  6. Upload the merged data to MongoDB (using upserts for each card)
 *  7. Clean up temporary files, preserving any `.keep` files in the temp directory
 *
 * Implementation notes:
 * - Uses `execSync` to block and wait for each step to complete before starting the next.
 * - If any step fails, the script exits immediately with an error code.
 * - Each sub-script is run via `npx ts-node`, allowing you to use TypeScript scripts without precompiling.
 */

import { execSync } from 'child_process';
import path from 'path';

// Helper to run a TypeScript script synchronously and inherit console output
const runScript = (script: string) =>
  execSync(`npx ts-node ${path.join(__dirname, script)}`, { stdio: 'inherit' });

const tempDir = path.join(__dirname, '../temp');

async function runAll() {
  try {
    // STEP 1: Download raw MTGJSON files
    runScript('downloadJson.ts');

    // STEP 2: Parse AllIdentifiers.json to NDJSON cards
    runScript('parseCards.ts');

    // STEP 3: Parse AllPrices.json to NDJSON prices
    runScript('parsePrices.ts');

    // STEP 4: Sort both NDJSON files by UUID for merge join
    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedCards.ndjson')} ${path.join(tempDir, 'cardsSorted.ndjson')}`
    );
    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedPrices.ndjson')} ${path.join(tempDir, 'pricesSorted.ndjson')}`
    );

    // STEP 5: Merge the two sorted NDJSON files into a merged file
    runScript('mergeSortedNdjson.ts');

    // STEP 6: Upload the merged card+price data to MongoDB
    runScript('uploadToMongo.ts');

    // STEP 7: Remove temp NDJSON files, but keep .keep files
    runScript('cleanUp.ts');
  } catch (error) {
    console.error(`Pipeline failed: ${error}`);
    process.exit(1);
  }
}

runAll();
