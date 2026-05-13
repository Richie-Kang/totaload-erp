import { app } from './app.js';

const port = Number(process.env.BACKEND_PORT) || 4000;

app.listen(port, () => {
  console.log(`backend listening on :${port}`);
});
