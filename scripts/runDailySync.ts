/**
 * Goblin Bookie – Master Runner Script (Pipeline Orchestrator)
 *
 * PURPOSE:
 *   Runs the entire Goblin Bookie daily sync pipeline, one step at a time, in a fixed order.
 *   Ensures that:
 *     - Fresh MTGJSON data is downloaded,
 *     - Card and price data are parsed and filtered,
 *     - Outputs are sorted, merged, and uploaded to MongoDB,
 *     - All temp files are cleaned up.
 *
 * CONTEXT:
 *   - Run this manually or via a scheduled cron job (e.g., on Render or server) to keep your database in sync.
 *   - Each step is a separate TypeScript script, invoked with `npx ts-node` so you never need to precompile.
 *   - If any step fails, the pipeline stops immediately and exits with a non-zero code.
 *   - All script output and errors appear in your terminal/console, and logs from each child script
 *     are handled by their own logging helpers (see /logs/sync.log).
 *
 * PIPELINE STEPS:
 *   1. Download MTGJSON files (AllIdentifiers.json, AllPrices.json)
 *   2. Parse cards (outputs parsedCards.ndjson)
 *   3. Parse prices (outputs parsedPrices.ndjson)
 *   4. Sort both NDJSON files by UUID (cardsSorted.ndjson, pricesSorted.ndjson)
 *   5. Merge card and price data into mergedCards.ndjson
 *   6. Upload merged data to MongoDB
 *   7. Clean up temp files (preserving .keep for version control)
 *
 * IMPLEMENTATION DETAILS:
 *   - Uses `execSync` to block and wait for each step before starting the next (safe, deterministic).
 *   - Uses path.join(__dirname, ...) so it works no matter where script is launched from.
 *   - All paths are relative to project root for portability.
 *   - No direct logging from this script—all logs are handled by sub-scripts.
 */

import { execSync } from 'child_process';
import path from 'path';

const runScript = (script: string) =>
  execSync(`npx ts-node ${path.join(__dirname, script)}`, { stdio: 'inherit' });

path.join(__dirname, '../temp');
async function runAll() {
  try {
    // STEP 1: Download raw MTGJSON files (AllIdentifiers.json, AllPrices.json)
    runScript('downloadJson.ts');

    // STEP 2: Parse card data into parsedCards.ndjson
    runScript('parseCards.ts');

    // STEP 3: Parse price data into parsedPrices.ndjson
    runScript('parsePrices.ts');

    // STEP 4: Sort NDJSON files by UUID for streaming merge
    runScript('sortCards.ts');
    runScript('sortPrices.ts');

    // STEP 5: Merge card and price data into mergedCards.ndjson
    runScript('mergeSortedNdjson.ts');

    // STEP 6: Upload merged data to MongoDB
    runScript('uploadToMongo.ts');

    // STEP 7: Clean up temp files (keeps .keep for git)
    runScript('cleanUp.ts');

    // STEP 8: Sync Scryfall images for missing imageUrls
    runScript('syncScryfallImages.ts');
  } catch (error) {
    // If any step fails, log and exit with error
    console.error(`[runDailySync.ts] Pipeline failed: ${error}`);
    process.exit(1);
  }
}

// Start pipeline when script is run
runAll();
