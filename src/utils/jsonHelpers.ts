import fs from 'fs';
import path from 'path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamObject } from 'stream-json/streamers/StreamObject';

// logs with consistent format
export function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[LOG] ${timestamp}: ${message}`);
}
// error logs with consistent format
export function logError(message: string) {
  const timestamp = new Date().toISOString();
  console.error(`[ERROR] ${timestamp}: ${message}`);
}

// writing to JSON
export async function writeJsonFile(
  outputPath: string,
  data: any,
  pretty: boolean = true
): Promise<void> {
  try {
    const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
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
export function waitForStreamFinish(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export function startTimer(label: string) {
  console.time(`[TIMER] ${label}`);
}

export function endTimer(label: string) {
  console.timeEnd(`[TIMER] ${label}`);
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
    log(`Deleted file: ${filePath}`);
  } catch (err: any) {
    logError(`Failed to delete file ${filePath}: ${err.message}`);
  }
}

export async function cleanDirectory(dirPath: string, match: RegExp): Promise<void> {
  try {
    const files = await fs.promises.readdir(dirPath);
    const deletions = files
      .filter((f) => match.test(f))
      .map((f) => deleteFile(path.join(dirPath, f)));
    await Promise.all(deletions);
    log(`Cleaned directory: ${dirPath}`);
  } catch (err: any) {
    logError(`Failed to clean directory ${dirPath}: ${err.message}`);
  }
}
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
