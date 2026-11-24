import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Strict Content-Security-Policy injected into production HTML as a fallback
// alongside the HTTP Content-Security-Policy header in vercel.json.
// No 'unsafe-inline' in script-src and no third-party analytics/recording origins.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspMeta = () => ({
  name: 'voxrelay-csp-meta',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    const metaTag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`;
    if (!/<meta\s+charset=/i.test(html)) {
      throw new Error('[voxrelay-csp-meta] Unable to locate <meta charset> in index.html');
    }
    return html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i, `$1\n    ${metaTag}`);
  },
});

const ALLOWED_API_ROUTES = new Set([
  'health',
  'ready',
  'status',
  'contact',
  'auth',
  'admin',
  'assignments',
  'terms',
  'support',
  'assistant',
  'ops',
]);

// Serves /api/*.js handlers inside `vite` dev mode so routes like /status and /api/health
// work in local preview without requiring `vercel dev`.
const devApiPlugin = () => ({
  name: 'voxrelay-dev-api',
  apply: 'serve' as const,
  configureServer(server: ViteDevServer) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      next();
    });
    const env = loadEnv(server.config.mode || 'development', process.cwd(), '');
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    server.middlewares.use('/api', async (req, res, next) => {
      const rawUrl = req.url || '/';
      const parsed = new URL(rawUrl, 'http://localhost');
      const segment = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
      if (!ALLOWED_API_ROUTES.has(segment)) {
        return next();
      }
      try {
        const modUrl = pathToFileURL(path.resolve(process.cwd(), 'api', `${segment}.js`)).href;
        const mod = (await import(/* @vite-ignore */ `${modUrl}?t=${Date.now()}`)) as {
          default: (req: unknown, res: unknown) => Promise<void>;
        };
        const query = Object.fromEntries(parsed.searchParams.entries());
        Object.assign(req, { query });
        await mod.default(req, res);
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Dev API error' }));
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), cspMeta(), devApiPlugin()],
  envPrefix: ['VITE_'],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
