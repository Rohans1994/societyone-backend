import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { pool } from './db/pool.js';
import { initializeDatabase } from './db/schema.js';

import societiesRouter from './routes/societies.js';
import usersRouter from './routes/users.js';
import vendorsRouter from './routes/vendors.js';
import tendorsRouter from './routes/tendors.js';
import invoicesRouter from './routes/invoices.js';
import receiptsRouter from './routes/receipts.js';
import maintenancePlansRouter from './routes/maintenancePlans.js';
import transactionsRouter from './routes/transactions.js';
import eventsRouter from './routes/events.js';
import noticesRouter from './routes/notices.js';
import ticketsRouter from './routes/tickets.js';
import fishbowlRouter from './routes/fishbowl.js';
import facilitiesRouter from './routes/facilities.js';
import bookingsRouter from './routes/bookings.js';
import facilityBlocksRouter from './routes/facilityBlocks.js';
import assetsRouter from './routes/assets.js';
import amcRouter from './routes/amc.js';
import configRouter from './routes/config.js';
import storageRouter from './routes/storage.js';
import adminMigrationRouter from './routes/adminMigration.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Allow the frontend (running on a different origin/port) to call this API.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- API Routes ---
app.use(societiesRouter);
app.use(usersRouter);
app.use(vendorsRouter);
app.use(tendorsRouter);
app.use(invoicesRouter);
app.use(receiptsRouter);
app.use(maintenancePlansRouter);
app.use(transactionsRouter);
app.use(eventsRouter);
app.use(noticesRouter);
app.use(ticketsRouter);
app.use(fishbowlRouter);
app.use(facilitiesRouter);
app.use(bookingsRouter);
app.use(facilityBlocksRouter);
app.use(assetsRouter);
app.use(amcRouter);
app.use(configRouter);
app.use(storageRouter);
app.use(adminMigrationRouter);

// Initialize DB and bootstrap tables, then start listening.
initializeDatabase()
  .then(() => {
    console.log('Database bootstrap phase completed.');
  })
  .catch((err) => {
    console.error('Critical database startup/bootstrap failure:', err);
  })
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`SocietyOne API server running on http://0.0.0.0:${PORT}`);
    });
  });

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});
