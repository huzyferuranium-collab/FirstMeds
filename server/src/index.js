import { openDb, DEFAULT_DB_PATH } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('Set JWT_SECRET to a random string of at least 32 characters.');
  process.exit(1);
}

const db = openDb();
if (!db.get('SELECT 1 FROM users LIMIT 1')) {
  if (process.env.NODE_ENV === 'production') {
    // Production: catalogue + programs + one admin from env, no demo facilities.
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword || adminPassword.length < 10) {
      console.error('Empty database: set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) to create the first HQ admin.');
      process.exit(1);
    }
    seed(db, { demo: process.env.SEED_DEMO === '1', adminEmail, adminPassword });
  } else {
    console.log('Empty database — loading demo data…');
    seed(db);
  }
}

const port = Number(process.env.PORT) || 4000;
createApp(db).listen(port, () => {
  console.log(`FirstMeds API listening on http://localhost:${port}  (db: ${DEFAULT_DB_PATH})`);
});
