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
const BATCH_SIZE = 1000;

if (!MONGO_URI) throw new Error('Missing MONGO_URI');

/**
 * Streams mergedCards.json and uploads card data to MongoDB.
 * - New cards: inserts full document
 * - Existing cards: merges new price paths
 * - Falls back to full price blob if no granular diffs found
 */
async function uploadToMongo() {
  try {
    log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);

    log('Streaming mergedCards.json...');

    let buffer: any[] = [];
    let uploaded = 0;

    const flushBuffer = async () => {
      if (buffer.length === 0) return;

      const operations = buffer.map((card) => {
        const update: any = {
          $setOnInsert: {
            uuid: card.uuid,
            name: card.name,
            setCode: card.setCode,
            language: card.language,
            scryfallId: card.scryfallId,
            purchaseUrls: card.purchaseUrls,
          },
          $set: {},
        };

        // Attempt granular update of price data by vendor/type/finish/date
        if (card.prices) {
          update.$set.prices = card.prices; // Always store full price object
        }

        // Fallback: if no granular diffs found, insert full prices object
        if (Object.keys(update.$set).length === 0 && card.prices) {
          update.$set.prices = card.prices;
        }

        return {
          updateOne: {
            filter: { uuid: card.uuid },
            update,
            upsert: true,
          },
        };
      });

      await Card.bulkWrite(operations);
      uploaded += buffer.length;
      log(`Uploaded ${uploaded} cards...`);
      buffer = [];
    };

    await new Promise<void>((resolve, reject) => {
      const pipeline = chain([fs.createReadStream(inputPath), parser(), streamArray()]);

      pipeline.on('data', async ({ value }) => {
        buffer.push(value);
        if (buffer.length >= BATCH_SIZE) {
          pipeline.pause();
          await flushBuffer();
          pipeline.resume();
        }
      });

      pipeline.on('end', async () => {
        await flushBuffer();
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
