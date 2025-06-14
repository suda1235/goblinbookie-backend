/**
 * Goblin Bookie – Upload to MongoDB (Price Merge)
 *
 * PURPOSE:
 *   Streams mergedCards.ndjson and upserts each card into MongoDB, merging today’s price data
 *   into the card’s historical price history so nothing is lost. Ensures Goblin Bookie can build
 *   a growing, time-series price database for each card, and avoids memory bloat at every stage.
 *
 * CONTEXT:
 *   - Input: mergedCards.ndjson (from mergeSortedNdjson step)
 *   - Output: All cards upserted in MongoDB with fully accumulated price history
 *   - All logs use [uploadToMongo.ts] as the tag for traceability
 *
 * IMPLEMENTATION DETAILS:
 *   - Streams NDJSON, parses and buffers upsert operations (500 per batch for efficiency)
 *   - For each card, loads prior prices (if present), deep-merges new data in
 *   - All writes are batched to minimize DB round trips (faster, safer for large datasets)
 *   - Disconnects from MongoDB only after all upserts and flushes
 *   - Progress log every 5000 cards so you can quickly verify nothing is stuck
 *   - Logs summary at the end
 */

import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Card from '../src/models/Card';
import { logInfo, logError } from '../src/utils/jsonHelpers';

dotenv.config();

// Connect to MongoDB from your .env connection string
mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => logInfo('[uploadToMongo.ts]', 'MongoDB connected'));

/**
 * Deeply merge price objects so all previous price dates are kept and only today’s
 * prices are added or updated. Avoids overwriting any existing price history.
 * Makes a deep clone of the existing object to avoid accidental mutation.
 */
function mergePriceObjects(existing: any = {}, incoming: any = {}): any {
  const result = JSON.parse(JSON.stringify(existing || {}));
  for (const vendor in incoming) {
    if (!result[vendor]) result[vendor] = {};
    for (const type in incoming[vendor]) {
      if (!result[vendor][type]) result[vendor][type] = {};
      for (const finish in incoming[vendor][type]) {
        if (!result[vendor][type][finish]) result[vendor][type][finish] = {};
        for (const date in incoming[vendor][type][finish]) {
          result[vendor][type][finish][date] = incoming[vendor][type][finish][date];
        }
      }
    }
  }
  return result;
}

/**
 * Reads card price data from NDJSON, merges with any existing prices in MongoDB,
 * and upserts the result back to the DB in batches (efficient, memory-safe).
 * Logs progress every 5000 cards processed.
 */
async function uploadNDJSON(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  const buffer: any[] = [];
  let total = 0;
  const batchSize = 500;

  for await (const line of rl) {
    const card = JSON.parse(line);

    // Load existing prices from DB by uuid (lean for speed)
    const existing = await Card.findOne({ uuid: card.uuid }, { prices: 1 }).lean();

    // Merge in today’s prices, preserving all historical data
    const mergedPrices = mergePriceObjects(existing?.prices, card.prices);

    const updatedCard = { ...card, prices: mergedPrices };

    buffer.push({
      updateOne: {
        filter: { uuid: updatedCard.uuid },
        update: { $set: updatedCard },
        upsert: true,
      },
    });

    // Batch upserts for efficiency (write every 500 records)
    if (buffer.length >= batchSize) {
      await Card.bulkWrite(buffer);
      total += buffer.length;
      buffer.length = 0;

      if (total % 5000 === 0) logInfo('[uploadToMongo.ts]', `Uploaded ${total} cards so far...`);
    }
  }

  // Flush any remaining records
  if (buffer.length > 0) {
    await Card.bulkWrite(buffer);
    total += buffer.length;
  }

  logInfo(
    '[uploadToMongo.ts]',
    `Upload complete: ${total} cards inserted or updated (with merged price history)`
  );
  mongoose.disconnect();
}

// Start the upload; log any fatal errors at the very end
uploadNDJSON('temp/mergedCards.ndjson').catch((err) =>
  logError('[uploadToMongo.ts]', `Upload failed: ${err}`)
);
