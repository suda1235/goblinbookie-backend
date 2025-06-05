import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema({
    name: String,
    set: String,
    tcgplayerId: Number,
});

export default mongoose.model('Card', cardSchema);
