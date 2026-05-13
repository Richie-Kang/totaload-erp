import { app } from './app.js';
import { runMigrations } from './db/migrate.js';

const port = Number(process.env.BACKEND_PORT) || 4000;

// Surface missing config at boot with the variable name (§2.8 배포/운영) rather than a bare connect error.
if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set — database connection will fail');
if (!process.env.OCR_SERVICE_URL) console.warn('OCR_SERVICE_URL is not set — defaulting to http://localhost:8000');

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`backend listening on :${port}`);
    });
  })
  .catch((err) => {
    console.error('startup failed:', err);
    process.exit(1);
  });
