/**
 * Upload to MongoDB
 *
 * What this does:
 * This script reads the final `mergedCards.ndjson` line-by-line and performs
 * bulk upserts to your MongoDB collection using the Mongoose `Card` model.
 *
 * Why we need this:
 * - This is the final destination for our cleaned and merged card + price data.
 * - Every entry is either inserted or updated in-place based on `uuid`.
 * - We use `bulkWrite` in batches to stay fast and avoid crashing from too many operations.
 *
 * Why it’s safe:
 * - We read and write in small batches (500 items at a time).
 * - We stream input line-by-line, so the file can be gigabytes, and we won’t die.
 * - We give progress logs every 5000 cards uploaded, so you know it’s not frozen.
 *
 * Tips:
 * - Your `.env` file must include `MONGO_URI=...` for this to work.
 * - If you're on Render or a remote server, double-check indexing for performance.
 */

import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Card from '../src/models/Card';
import { log, logError } from '../src/utils/jsonHelpers';

// Load MongoDB URI from .env
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI!).then(() => log('MongoDB connected'));

async function uploadNDJSON(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  const buffer: any[] = [];
  let total = 0;
  const batchSize = 500; // Write in batches of 500 documents

  for await (const line of rl) {
    const card = JSON.parse(line);

    // Build a MongoDB bulkWrite operation for upsert
    buffer.push({
      updateOne: {
        filter: { uuid: card.uuid },
        update: { $set: card },
        upsert: true,
      },
    });

    // Flush when buffer is full
    if (buffer.length >= batchSize) {
      await Card.bulkWrite(buffer);
      total += buffer.length;
      buffer.length = 0; // Reset buffer

      // Log every 5k cards so we know it's still going
      if (total % 5000 === 0) log(`Uploaded ${total} cards so far...`);
    }
  }

  // Final flush (in case of leftover < batchSize)
  if (buffer.length > 0) {
    await Card.bulkWrite(buffer);
    total += buffer.length;
  }

  log(`Upload complete: ${total} cards inserted or updated`);
  mongoose.disconnect();
}

// Kick off upload from mergedCards.ndjson
uploadNDJSON('temp/mergedCards.ndjson').catch((err) => logError(`Upload failed: ${err}`));
