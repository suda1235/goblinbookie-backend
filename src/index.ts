import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';

import cardsRouter from './routes/cards';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/images', express.static(path.join(__dirname, '../images')));

app.use(cors());
app.use(express.json());

app.use('/api', cardsRouter);

app.get('/ping', (_req, res) => {
  res.send('pong');
});

mongoose
  .connect(process.env.MONGO_URI || '', { dbName: 'goblin-bookie' })
  .then(() => {
    console.log('Connected to MongoDB:', process.env.MONGO_URI);
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
  });
