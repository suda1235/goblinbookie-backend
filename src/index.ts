import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Card from './models/Card';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/ping', (_req, res) => {
    res.send('pong');
});
app.get('/add-test-card', async (_req, res) => {
    const card = await Card.create({ name: 'Lightning Bolt', set: 'M10', tcgplayerId: 12345 });
    res.json(card);
});
mongoose.connect(process.env.MONGO_URI || '', {
    dbName: 'goblin-bookie',
}).then(() => {
    console.log('✅ MongoDB Atlas connected');
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
});
