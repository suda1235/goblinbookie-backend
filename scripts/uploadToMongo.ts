import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Card from '../src/models/Card';
import { log, logError } from '../src/utils/jsonHelpers';

dotenv.config();

mongoose.connect(process.env.MONGO_URI!).then(() => log('MongoDB connected'));

async function uploadNDJSON(filePath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });

  const buffer: any[] = [];
  let total = 0;
  const batchSize = 500;

  for await (const line of rl) {
    const card = JSON.parse(line);
    buffer.push({
      updateOne: {
        filter: { uuid: card.uuid },
        update: { $set: card },
        upsert: true,
      },
    });

    if (buffer.length >= batchSize) {
      await Card.bulkWrite(buffer);
      total += buffer.length;
      buffer.length = 0; // Clear buffer
      if (total % 5000 === 0) log(`Uploaded ${total} cards so far...`);
    }
  }

  // Final flush
  if (buffer.length > 0) {
    await Card.bulkWrite(buffer);
    total += buffer.length;
  }

  log(`Upload complete: ${total} cards inserted or updated`);
  mongoose.disconnect();
}

uploadNDJSON('temp/mergedCards.ndjson').catch((err) => logError(`Upload failed: ${err}`));
