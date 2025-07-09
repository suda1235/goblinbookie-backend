/**
 * Goblin Bookie – Express Backend Entry Point
 *
 * PURPOSE:
 *   Initializes and runs the Express server for the Goblin Bookie API.
 *   Connects to MongoDB, sets up REST routes, serves images, and configures middleware for JSON and CORS.
 *
 * CONTEXT:
 *   - This is the main entry point for the backend application.
 *   - Responsible for starting the API, handling requests, and exposing all endpoints (cards, health check, images).
 *   - Used in both development (local) and production (e.g., Render, Railway) environments.
 *
 * IMPLEMENTATION DETAILS:
 *   - Loads environment variables with dotenv for secrets/config management.
 *   - Sets up CORS to allow cross-origin API calls from your frontend.
 *   - Configures Express to parse JSON bodies and serve static images from the /images directory.
 *   - All core card API logic is delegated to the `/routes/cards` router.
 *   - Provides a `/health` endpoint for deployment health checks (used by Render/hosting providers).
 *   - Provides a `/ping` endpoint for simple liveness checks (manual or for uptime monitoring).
 *   - Uses Mongoose to connect to MongoDB and log connection status.
 *   - Starts the Express server only after MongoDB connection is confirmed, ensuring no API calls are handled with a disconnected DB.
 */

import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors = require('cors');

import path from 'path';

import cardsRouter from './routes/cards';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static images if needed
app.use('/images', express.static(path.join(__dirname, '../images')));

app.use(cors());
app.use(express.json());

app.use('/api', cardsRouter);

// Health check endpoint for Render
app.get('/health', (_req, res) => res.status(200).send('OK'));

// Optional: Simple ping for fast check
app.get('/ping', (_req, res) => res.send('pong'));

// Start DB and server
mongoose
  .connect(process.env.MONGO_URI || '', { dbName: 'goblin-bookie' })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
  });
