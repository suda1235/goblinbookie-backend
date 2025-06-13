/**
 * Upload to MongoDB – with Historical Price Merge (Fixed Deep Merge)
 *
 * This version correctly merges incoming (today's) price data with any existing historical price data
 * for each card, ensuring that your price history accumulates day by day instead of being overwritten.
 */

import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Card from '../src/models/Card';
import { log, logError } from '../src/utils/jsonHelpers';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI!).then(() => log('MongoDB connected'));

/**
 * Deep merge price objects: preserves all historical dates, adds/replaces today's prices.
 * Uses JSON deep clone to prevent reference bugs!
 */
function mergePriceObjects(existing: any = {}, incoming: any = {}): any {
  // Deep clone existing so we don't mutate any referenced objects
  const result = JSON.parse(JSON.stringify(existing || {}));

  for (const vendor in incoming) {
    if (!result[vendor]) result[vendor] = {};
    for (const type in incoming[vendor]) {
      if (!result[vendor][type]) result[vendor][type] = {};
      for (const finish in incoming[vendor][type]) {
        if (!result[vendor][type][finish]) result[vendor][type][finish] = {};
        for (const date in incoming[vendor][type][finish]) {
          // Overwrite/add just this date's price
          result[vendor][type][finish][date] = incoming[vendor][type][finish][date];
        }
      }
    }
  }
  return result;
}

/**
 * Main upload function: streams the NDJSON, merges historical prices, and upserts in batches.
 */
async function uploadNDJSON(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  const buffer: any[] = [];
  let total = 0;
  const batchSize = 500;

  for await (const line of rl) {
    const card = JSON.parse(line);

    // --- KEY CHANGE: merge price history before upserting ---
    // Fetch just the prices field for this card (returns null if not found)
    const existing = await Card.findOne({ uuid: card.uuid }, { prices: 1 }).lean();

    // DEBUG: Show before and after for the first few cards
    if (total < 5) {
      console.log('\n--- Card UUID:', card.uuid, '---');
      console.log('Existing prices:', JSON.stringify(existing?.prices, null, 2));
      console.log('Incoming prices:', JSON.stringify(card.prices, null, 2));
    }

    const mergedPrices = mergePriceObjects(existing?.prices, card.prices);

    if (total < 5) {
      console.log('Merged prices:', JSON.stringify(mergedPrices, null, 2));
    }

    const updatedCard = { ...card, prices: mergedPrices };
    // --------------------------------------------------------

    buffer.push({
      updateOne: {
        filter: { uuid: updatedCard.uuid },
        update: { $set: updatedCard },
        upsert: true,
      },
    });

    // Flush when buffer is full
    if (buffer.length >= batchSize) {
      await Card.bulkWrite(buffer);
      total += buffer.length;
      buffer.length = 0;

      if (total % 5000 === 0) log(`Uploaded ${total} cards so far...`);
    }
  }

  // Final flush (if any)
  if (buffer.length > 0) {
    await Card.bulkWrite(buffer);
    total += buffer.length;
  }

  log(`Upload complete: ${total} cards inserted or updated (with merged price history)`);
  mongoose.disconnect();
}

// Start upload from mergedCards.ndjson
uploadNDJSON('temp/mergedCards.ndjson').catch((err) => logError(`Upload failed: ${err}`));
