import { app } from './app.js';
import { runMigrations } from './db/migrate.js';

const port = Number(process.env.BACKEND_PORT) || 4000;

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
