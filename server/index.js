import { createServer } from 'node:http';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const app = createApp();
const server = createServer(app);
server.listen(port, () => console.log(`Processor Freedom Sites is running on http://localhost:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => { app.close(); process.exit(0); }));
