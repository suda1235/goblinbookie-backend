import fs from 'fs';
import readline from 'readline';
import { log, logError, waitForStreamFinish } from '../src/utils/jsonHelpers';

async function sortNdjson(inputPath: string, outputPath: string): Promise<void> {
  log(`📥 Starting sort for ${inputPath}`);
  const lines: any[] = [];
  let total = 0;
  let failed = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      lines.push(JSON.parse(line));
      total++;
    } catch (err) {
      failed++;
      logError(`Skipping invalid JSON line: ${err}`);
    }
  }

  lines.sort((a, b) => a.uuid.localeCompare(b.uuid));

  const writer = fs.createWriteStream(outputPath, 'utf-8');
  for (const item of lines) writer.write(JSON.stringify(item) + '\n');

  writer.end();
  await waitForStreamFinish(writer);

  log(`Finished sort: ${total} items sorted, ${failed} skipped due to parse errors`);
}

if (require.main === module) {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    console.error('Usage: ts-node sortNdjson.ts <inputPath> <outputPath>');
    process.exit(1);
  }

  sortNdjson(inputPath, outputPath).catch((err) => {
    logError(`sortNdjson failed: ${err}`);
    process.exit(1);
  });
}
