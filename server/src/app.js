import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import { HttpError } from './util.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import productRoutes from './routes/products.js';
import inventoryRoutes from './routes/inventory.js';
import salesRoutes from './routes/sales.js';
import patientRoutes from './routes/patients.js';
import programRoutes from './routes/programs.js';
import claimRoutes from './routes/claims.js';
import reminderRoutes from './routes/reminders.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(db, { serveClient = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true, service: 'firstmeds', time: new Date().toISOString() }));
  api.use('/public', publicRoutes(db));
  api.use('/auth', authRoutes(db));

  const authed = requireAuth(db);
  api.use('/products', authed, productRoutes(db));
  api.use('/inventory', authed, inventoryRoutes(db));
  api.use('/sales', authed, salesRoutes(db));
  api.use('/patients', authed, patientRoutes(db));
  api.use('/programs', authed, programRoutes(db));
  api.use('/claims', authed, claimRoutes(db));
  api.use('/reminders', authed, reminderRoutes(db));
  api.use('/reports', authed, reportRoutes(db));
  api.use('/admin', authed, adminRoutes(db));
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use('/api', api);

  // Serve the built React app (client/dist) with SPA fallback.
  const dist = join(here, '..', '..', 'client', 'dist');
  if (serveClient && existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    const status = err instanceof HttpError ? err.status : err?.status && err.status < 500 ? err.status : 500;
    if (status >= 500) console.error(err);
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'That record already exists' });
    }
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message, details: err.details });
  });

  return app;
}
