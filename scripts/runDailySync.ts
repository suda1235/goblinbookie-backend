import { execSync } from 'child_process';
import path from 'path';

const runScript = (script: string) =>
  execSync(`npx ts-node ${path.join(__dirname, script)}`, { stdio: 'inherit' });

const tempDir = path.join(__dirname, '../temp');

async function runAll() {
  try {
    runScript('downloadJson.ts');
    runScript('parseCards.ts');
    runScript('parsePrices.ts');

    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedCards.ndjson')} ${path.join(tempDir, 'cardsSorted.ndjson')}`
    );
    runScript(
      `sortNdjson.ts ${path.join(tempDir, 'parsedPrices.ndjson')} ${path.join(tempDir, 'pricesSorted.ndjson')}`
    );

    runScript('mergeSortedNdjson.ts');
    runScript('uploadToMongo.ts');
    runScript('cleanUp.ts');
  } catch (error) {
    console.error(`Pipeline failed: ${error}`);
    process.exit(1);
  }
}

runAll();
