import { buildApp } from '../../apps/api/src/app.js';
import { database } from '../../apps/api/src/db.js';
import { nutritionTransport } from './nutrition-provider.js';
// Independent memory database and explicit provider mock; never loads business .env.
const app = await buildApp({ db: await database(), demo: true, requestLimit: 1000,
  secret: 'isolated-nutrition-browser-secret-32-characters', corsOrigin: 'http://127.0.0.1:5177',
  nutrition: { apiKey: 'test-only-key', transport: nutritionTransport() } });
await app.listen({ host: '127.0.0.1', port: 3014 });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
