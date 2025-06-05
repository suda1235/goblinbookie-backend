import fs from 'fs';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamValues } from 'stream-json/streamers/StreamValues';

export type ReadJsonOptions = {
  streamKey?: string; // to stream just the top-level `data` field
};

export async function readJsonFile(filePath: string, options?: ReadJsonOptions): Promise<any> {
  if (options && typeof options.streamKey === 'string') {
    return new Promise((resolve, reject) => {
      const stream = chain([
        fs.createReadStream(filePath),
        parser(),
        pick({ filter: options.streamKey as string }),
        streamValues(),
      ]);

      const result: Record<string, any> = {};

      stream.on('data', ({ value }) => {
        Object.assign(result, value);
      });

      stream.on('end', () => resolve({ [options.streamKey!]: result }));
      stream.on('error', reject);
    });
  }

  // Default non-streaming mode (small files)
  const text = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(filePath, json, 'utf8');
}

export function log(message: string) {
  console.log(`[LOG] ${message}`);
}

export function logError(message: string, error: unknown) {
  console.error(`[ERROR] ${message}`);
  console.error(error);
}
