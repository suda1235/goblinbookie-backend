import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';

// logs with consistent format
export function log(message: string) {
  console.log(`[LOG] ${new Date().toISOString()}: ${message}`);
}

// error logs with consistent format
export function logError(message: string) {
  console.log(`[ERROR] ${new Date().toISOString()}: ${message}`);
}

// writing to JSON
export async function writeJsonFile(outputPath: string, data: any): Promise<void> {
  try {
    const json = JSON.stringify(data, null, 2); //prettified
    await fs.promises.writeFile(outputPath, json, 'utf-8');
    log(`Successfully wrote JSON to ${outputPath}`);
  } catch (err) {
    logError(`Failed to write JSON to ${outputPath}`);
    throw err;
  }
}

/**
 * Streams a JSON file and processes values under a given key (like "data").
 *
 * @param inputPath  Path to the large input JSON file
 * @param streamKey  The top-level key you want to stream from (e.g. "data")
 * @param onData     Function to run on each emitted value
 * @param onEnd      Optional function to call when streaming is complete
 */

export async function streamJsonArray({
  inputPath,
  streamKey,
  onData,
  onEnd,
}: {
  inputPath: string;
  streamKey: string;
  onData: (item: any) => void;
  onEnd?: () => void;
}) {
  const pipeline = chain([
    fs.createReadStream(inputPath),
    parser(),
    pick({ filter: streamKey }),
    streamObject(),
  ]);

  pipeline.on('data', ({ value }) => onData(value));

  pipeline.on('end', () => {
    log(`Finished streaming JSON from ${inputPath}`);
    if (onEnd) onEnd();
  });

  pipeline.on('error', (err) => {
    logError(`Streaming error from ${inputPath}: ${err}`);
  });
}
