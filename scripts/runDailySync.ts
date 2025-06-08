/**
 * Master Script
 *
 * Master controller script for running the full daily sync pipeline.
 * This script:
 *   1. Downloads the latest MTGJSON data
 *   2. Parses cards and today's prices
 *   3. Merges card metadata with price data
 *   4. Uploads everything to MongoDB (insert new cards, update prices)
 *   5. Cleans up temporary JSON files
 *   6. Sends an email notification on success or failure
 *
 * Why this exists:
 *   - Centralizes the full workflow so it can be easily triggered on a schedule
 *   - Ensures each step runs in order and halts on failure
 *   - Produces logs for every phase so you can trace issues fast
 *   - Alerts you immediately if something breaks
 *
 * Implementation notes:
 *   - Uses `execSync` to run each child script synchronously (fail-fast model)
 *   - All scripts must live in the same `scripts/` directory
 *   - Expects log/error functions to be defined in `jsonHelpers.ts`
 */

import { execSync } from 'child_process';
import path from 'path';
import { log, logError } from '../src/utils/jsonHelpers';
import { sendEmailNotification } from '../src/utils/notify';

// The exact sequence of scripts to run
const steps = [
  'DownloadJson',
  'parseCards',
  'parsePrices',
  'mergeCardsAndPrices',
  'uploadToMongo',
  'cleanup',
];

/**
 * Runs a script from the /scripts directory using ts-node.
 * If a script fails, the pipeline aborts with an error log.
 */
function runScript(name: string) {
  const scriptPath = path.join(__dirname, `${name}.ts`);
  try {
    log(`Running ${name}...`);
    execSync(`npx ts-node ${scriptPath}`, { stdio: 'inherit' }); // inherits console output
    log(`Finished ${name}`);
  } catch (err) {
    const errorMsg = `${name} failed. Aborting pipeline.`;
    logError(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Main pipeline runner: calls each step in order.
 * Sends email on success or failure.
 */
async function runAll() {
  try {
    for (const step of steps) {
      runScript(step);
    }

    const successMsg = `Goblin Bookie daily sync completed successfully at ${new Date().toLocaleString()}`;
    log(successMsg);
    await sendEmailNotification('Goblin Bookie Sync Success', successMsg);
  } catch (err) {
    const failureMsg = `Goblin Bookie sync failed: ${(err as Error).message}`;
    logError(failureMsg);
    await sendEmailNotification('Goblin Bookie Sync Failed', failureMsg);
    process.exit(1);
  }
}

runAll();
