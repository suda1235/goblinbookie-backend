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
});

export default mongoose.model('Card', cardSchema);
