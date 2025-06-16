// scripts/syncScryfallImages.ts

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Card from '../src/models/Card'; // Adjust path if needed

dotenv.config();

const PLACEHOLDER_IMAGE = '/images/PlaceHolder.png';

// Helper to fetch image URL from Scryfall using the native fetch
async function getScryfallImageUrl(scryfallId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${scryfallId}`);
    if (res.status === 429) {
      console.warn('Rate limited by Scryfall. Waiting 2 seconds...');
      await new Promise((res) => setTimeout(res, 2000)); // wait 2 seconds, then try again
      return getScryfallImageUrl(scryfallId); // recursive retry once
    }
    if (!res.ok) return null;
    const cardData = await res.json();

    if (cardData.image_uris && cardData.image_uris.normal) {
      return cardData.image_uris.normal;
    }
    if (cardData.card_faces && cardData.card_faces[0]?.image_uris?.normal) {
      return cardData.card_faces[0].image_uris.normal;
    }
    return null;
  } catch (err) {
    console.error('Scryfall fetch error:', err);
    return null;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: 'goblin-bookie' });

  // Find all cards missing imageUrl or set to placeholder
  const query = {
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }, { imageUrl: PLACEHOLDER_IMAGE }],
    scryfallId: { $exists: true, $ne: null },
  };

  const batchSize = 200; // You can adjust for larger runs
  let skip = 0;
  let updated = 0;
  let cards: any[] = [];

  do {
    cards = await Card.find(query).skip(skip).limit(batchSize);
    console.log(`Processing ${cards.length} cards in batch starting at ${skip}...`);

    for (const card of cards) {
      if (!card.scryfallId) continue;

      // Only update if missing or is placeholder
      if (!card.imageUrl || card.imageUrl === PLACEHOLDER_IMAGE) {
        const url = await getScryfallImageUrl(card.scryfallId);
        if (url) {
          card.imageUrl = url;
          await card.save();
          updated++;
          console.log(`Updated image for "${card.name}" (${card.uuid})`);
        } else {
          card.imageUrl = PLACEHOLDER_IMAGE;
          await card.save();
          console.warn(`No image found for "${card.name}" (${card.uuid}), set to placeholder.`);
        }
        // Wait 100ms between Scryfall API calls
        await new Promise((res) => setTimeout(res, 100));
      }
    }
    skip += batchSize;
  } while (cards.length === batchSize); // Continue until all batches are processed

  console.log(`\nDone. Updated ${updated} cards with images.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
