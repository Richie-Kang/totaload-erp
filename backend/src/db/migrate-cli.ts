import { runMigrations } from './migrate.js';
import { pool } from './pool.js';

// CLI entrypoint for `npm -w backend run migrate`.
runMigrations()
  .then(() => {
    console.log('migrations applied');
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
    return pool.end();
  });
