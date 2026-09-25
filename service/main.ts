import http from 'node:http';
import { resolveServiceConfig } from './config.js';
import { createExtensionService } from './server.js';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';

const start = async (): Promise<http.Server> => {
  const config = await resolveServiceConfig();
  const server = createExtensionService({ port, token, config });
  server.listen(port, '127.0.0.1');
  return server;
};

void start().catch(() => {
  process.exitCode = 1;
});
