/**
 * Goblin Bookie – Card Model (Mongoose Schema)
 *
 * PURPOSE:
 *   Defines the MongoDB schema and Mongoose model for all Magic cards in the Goblin Bookie database.
 *   This schema captures all core card data, including prices, unique identifiers, and images.
 *
 * CONTEXT:
 *   - All card documents in the MongoDB collection conform to this structure.
 *   - Used throughout the backend for querying, updating, and validating card records.
 *   - Enables indexed, efficient access for searching cards by name, set, or UUID.
 *
 * IMPLEMENTATION DETAILS:
 *   - Uses flexible sub-schemas for pricing data to allow dynamic price points (e.g., per date).
 *   - `purchaseUrls` is stored as a Map of vendor name -> URL, supporting easy price lookups and link-outs.
 *   - Default value for `imageUrl` is a placeholder; later scripts update this with a Scryfall image.
 *   - Disables the `_id` field for subdocuments where not needed, for MongoDB storage efficiency.
 *
 * FIELD OVERVIEW:
 *   - uuid:         Primary unique identifier (MTGJSON UUID, required and unique)
 *   - name:         Card name (indexed for fast search)
 *   - setCode:      Set abbreviation (indexed)
 *   - language:     Language code (e.g., 'en')
 *   - scryfallId:   Scryfall UUID for image and API lookups
 *   - purchaseUrls: Map of vendor names to purchase URLs (e.g., TCGplayer, Card Kingdom, Cardmarket)
 *   - prices:       Nested pricing info for each vendor, with buylist/retail breakdown
 *   - imageUrl:     Path or URL to card image (placeholder by default)
 */

import mongoose from 'mongoose';

const pricePointsSchema = new mongoose.Schema({}, { strict: false });

const priceListSchema = new mongoose.Schema(
  {
    buylist: pricePointsSchema,
    retail: pricePointsSchema,
    currency: String,
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  name: { type: String, index: true },
  setCode: { type: String, index: true },
  language: String,
  scryfallId: String,
  purchaseUrls: { type: Map, of: String },
  prices: {
    tcgplayer: priceListSchema,
    cardkingdom: priceListSchema,
    cardmarket: priceListSchema,
  },
  imageUrl: { type: String, default: '/images/PlaceHolder.png' },
});

export default mongoose.model('Card', cardSchema);
