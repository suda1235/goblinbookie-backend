/**
 * Upload to MongoDB – with Historical Price Merge (Fixed Deep Merge)
 *
 * This script uploads card price data to MongoDB and ensures that historical price data
 * is preserved for each card. When new price data for a card arrives, it is merged with
 * any existing historical data so that price history accumulates over time and is never lost.
 *
 * Key features:
 * - Streams NDJSON input to handle large datasets efficiently.
 * - Deeply merges today's prices into existing price history for each card.
 * - Upserts cards in MongoDB, preserving all previous price dates.
 */

import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Card from '../src/models/Card';
import { log, logError } from '../src/utils/jsonHelpers';

dotenv.config();

// Establish a connection to MongoDB using the connection string in .env
mongoose.connect(process.env.MONGO_URI!).then(() => log('MongoDB connected'));

/**
 * Deeply merge price objects so all previous price dates are kept and only today's
 * prices are added or updated. This avoids overwriting historical price data.
 * A deep clone of the existing object is made to prevent accidental mutation.
 */
function mergePriceObjects(existing: any = {}, incoming: any = {}): any {
  // Make a deep copy of existing prices so we don't mutate the original
  const result = JSON.parse(JSON.stringify(existing || {}));

  for (const vendor in incoming) {
    if (!result[vendor]) result[vendor] = {};
    for (const type in incoming[vendor]) {
      if (!result[vendor][type]) result[vendor][type] = {};
      for (const finish in incoming[vendor][type]) {
        if (!result[vendor][type][finish]) result[vendor][type][finish] = {};
        for (const date in incoming[vendor][type][finish]) {
          // For each date, add or update the price in the result
          result[vendor][type][finish][date] = incoming[vendor][type][finish][date];
        }
      }
    }
  }
  return result;
}

/**
 * Reads card price data from a NDJSON file, merges with any existing prices in MongoDB,
 * and upserts the result back to the database in batches.
 *
 * - Streams input line-by-line to minimize memory usage.
 * - Uses batch operations for efficient writes.
 * - Prints progress logs for every 5000 cards processed.
 */
async function uploadNDJSON(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  const buffer: any[] = [];
  let total = 0;
  const batchSize = 500;

  for await (const line of rl) {
    const card = JSON.parse(line);

    // Look up any existing price history for this card in MongoDB (by uuid)
    const existing = await Card.findOne({ uuid: card.uuid }, { prices: 1 }).lean();

    // Merge today's prices into the accumulated price history
    const mergedPrices = mergePriceObjects(existing?.prices, card.prices);

    // Build the new card object with full merged price history
    const updatedCard = { ...card, prices: mergedPrices };

    buffer.push({
      updateOne: {
        filter: { uuid: updatedCard.uuid },
        update: { $set: updatedCard },
        upsert: true,
      },
    });

    // Write to MongoDB in batches for efficiency
    if (buffer.length >= batchSize) {
      await Card.bulkWrite(buffer);
      total += buffer.length;
      buffer.length = 0;

      if (total % 5000 === 0) log(`Uploaded ${total} cards so far...`);
    }
  }

  // Flush any remaining cards in the buffer
  if (buffer.length > 0) {
    await Card.bulkWrite(buffer);
    total += buffer.length;
  }

  log(`Upload complete: ${total} cards inserted or updated (with merged price history)`);
  mongoose.disconnect();
}

// Start the upload process from the mergedCards.ndjson file
uploadNDJSON('temp/mergedCards.ndjson').catch((err) => logError(`Upload failed: ${err}`));
