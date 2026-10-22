/**
 * CRDF gateway server (optional).
 *
 * Serves the built React app and reverse-proxies API calls to the Python
 * (FastAPI + CrewAI) backend, so the browser only ever talks to one origin.
 *
 *   npm run build && npm start        -> http://localhost:3000
 *
 * Env:
 *   PYTHON_BACKEND_URL  where web_app.py is running (default http://127.0.0.1:8000)
 *   PORT                port for this gateway       (default 3000)
 *
 * There is intentionally NO local fake analysis here: if the Python backend is
 * down the gateway answers 502 with a clear message instead of inventing a verdict.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const TARGET = (process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

// NOTE: no body parsers before the proxy - multipart streams must pass through untouched.
const apiProxy = createProxyMiddleware({
  target: TARGET,
  // pathFilter (not app.use(path, ...)) so the full original path is forwarded.
  pathFilter: ['/analyze', '/generate_pdf', '/health', '/docs', '/openapi.json'],
  changeOrigin: true,
  // The 16-agent pipeline can take minutes; match the backend's 10 min timeout.
  proxyTimeout: 11 * 60 * 1000,
  timeout: 11 * 60 * 1000,
  on: {
    error: (err, _req, res) => {
      console.error('[gateway] proxy error:', (err as Error).message);
      const r = res as express.Response;
      if (r && typeof r.writeHead === 'function' && !r.headersSent) {
        r.writeHead(502, { 'Content-Type': 'application/json' });
        r.end(JSON.stringify({ error: `CRDF Python backend unreachable at ${TARGET}. Start web_app.py (uvicorn web_app:app --port 8000).` }));
      }
    },
  },
});

app.use(apiProxy);

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const dist = path.resolve(__dirname, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRDF gateway on http://localhost:${PORT}  ->  backend ${TARGET}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
