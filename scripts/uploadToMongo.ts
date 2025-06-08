/**
 * Database Upload Script
 *
 * This script streams the mergedCards.json file (containing card metadata + today's prices),
 * and performs batched upserts into MongoDB. New cards are inserted; existing cards are
 * updated by adding new price entries keyed by date.
 *
 * Why this exists:
 * - Enables efficient, batched insertion/updating of the full dataset (90k+ cards)
 * - Ensures price history is additive — never overwrites existing historical data
 * - Handles large data with streaming and batching for memory efficiency
 *
 * Implementation notes:
 * - Uses Mongoose's `bulkWrite` with `$setOnInsert` and `$set` for smart upsert behavior
 * - `flattenPaperPrices` maps nested vendor/type/finish/date structure into dot-notated update paths
 * - Card metadata is written only on insert; prices are written daily
 */

import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import Card from '../src/models/Card';
import { log, logError } from '../src/utils/jsonHelpers';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI!;
const inputPath = path.join(__dirname, '../temp/mergedCards.json');

if (!MONGO_URI) throw new Error('Missing MONGO_URI');

function flattenPaperPrices(paperPrices: any): Record<string, number | string> {
  const updates: Record<string, number | string> = {};

  for (const vendor of Object.keys(paperPrices)) {
    const priceList = paperPrices[vendor];
    if (priceList.currency) {
      updates[`prices.paper.${vendor}.currency`] = priceList.currency;
    }

    for (const type of ['retail', 'buylist']) {
      if (!priceList[type]) continue;
      for (const finish of ['normal', 'foil', 'etched']) {
        const dateMap = priceList[type][finish];
        if (!dateMap || typeof dateMap !== 'object') continue;
        for (const [date, price] of Object.entries(dateMap)) {
          if (typeof price === 'number') {
            updates[`prices.paper.${vendor}.${type}.${finish}.${date}`] = price;
          }
        }
      }
    }
  }

  return updates;
}

async function uploadToMongo() {
  try {
    log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      bufferCommands: false, // don't queue commands before connected
      autoIndex: false, // skip index creation during runtime
    });

    log('Streaming mergedCards.json...');
    let uploaded = 0;

    await new Promise<void>((resolve, reject) => {
      const pipeline = chain([fs.createReadStream(inputPath), parser(), streamArray()]);

      pipeline.on('data', async ({ value }) => {
        pipeline.pause(); // pause the stream until DB write completes

        const card = value;
        const priceUpdates = flattenPaperPrices(card.prices);

        try {
          await Card.updateOne(
            { uuid: card.uuid },
            {
              $setOnInsert: {
                uuid: card.uuid,
                name: card.name,
                setCode: card.setCode,
                language: card.language,
                scryfallId: card.scryfallId,
                purchaseUrls: card.purchaseUrls,
              },
              $set: priceUpdates,
            },
            { upsert: true }
          );
          uploaded++;
        } catch (err) {
          logError(`Failed to upsert card ${card.uuid}: ${err}`);
        }

        pipeline.resume(); // resume the stream
      });

      pipeline.on('end', () => {
        log(`Upload complete. Total cards uploaded: ${uploaded}`);
        resolve();
      });

      pipeline.on('error', (err) => {
        logError(`Upload stream failed: ${err}`);
        reject(err);
      });
    });
  } catch (err) {
    logError(`Upload to Mongo failed: ${err}`);
  } finally {
    await mongoose.disconnect();
  }
}

uploadToMongo();
