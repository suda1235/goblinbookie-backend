import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Card from './models/Card';
import cors from 'cors';

dotenv.config();

const app = express(); // ✅ Only one declaration

const PORT = process.env.PORT || 3000;

app.use(cors()); // ✅ Enable CORS for frontend access
app.use(express.json());

app.get('/ping', (_req, res) => {
    res.send('pong');
});

app.get('/add-test-card', async (_req, res) => {
    const card = await Card.create({ name: 'Lightning Bolt', set: 'M10', tcgplayerId: 12345 });
    res.json(card);
});

app.get('/api/cards/sample', async (_req, res) => {
    res.json([
        {
            name: 'Lightning Bolt',
            set: 'M10',
            tcgplayerId: 12345,
        },
        {
            name: 'Brainstorm',
            set: 'C21',
            tcgplayerId: 67890,
        },
    ]);
});

mongoose
    .connect(process.env.MONGO_URI || '', {
        dbName: 'goblin-bookie',
    })
    .then(() => {
        console.log('MongoDB Atlas connected');
        app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
    });
