import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function overpassProxyPlugin() {
  return {
    name: 'overpass-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/overpass', async (req: any, res: any, next: any) => {
        if (req.method !== 'POST') {
          return next();
        }

        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            let query = body;
            if (body.startsWith('data=')) {
              query = decodeURIComponent(body.slice(5));
            } else if (body.startsWith('{')) {
              try {
                const parsed = JSON.parse(body);
                query = parsed.data || parsed.query || body;
              } catch (_) {}
            }

            const endpoints = [
              'https://overpass-api.de/api/interpreter',
              'https://lz4.overpass-api.de/api/interpreter',
              'https://z.overpass-api.de/api/interpreter',
              'https://overpass.kumi.systems/api/interpreter',
            ];

            const fetchFromEndpoint = async (endpoint: string) => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 25000);
              try {
                const upstream = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    Referer: 'https://overpass-turbo.eu/',
                    Origin: 'https://overpass-turbo.eu',
                    Accept:
                      'application/osm3s+xml, application/json, application/geo+json, */*;q=0.8',
                    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
                  },
                  body: 'data=' + encodeURIComponent(query),
                  signal: controller.signal,
                });
                if (!upstream.ok) {
                  throw new Error(`Upstream ${endpoint} status: ${upstream.status}`);
                }
                const text = await upstream.text();
                const parsed = JSON.parse(text);
                if (!parsed || !Array.isArray(parsed.elements)) {
                  throw new Error(`Invalid JSON payload from ${endpoint}`);
                }
                return text;
              } finally {
                clearTimeout(timeoutId);
              }
            };

            try {
              const firstSuccessText = await Promise.any(
                endpoints.map((ep) => fetchFromEndpoint(ep))
              );
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(firstSuccessText);
              return;
            } catch (aggErr: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'Todos los servidores Overpass fallaron',
                  details: String(aggErr?.errors || aggErr),
                })
              );
            }
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'Error interno en proxy Overpass',
                details: String(e),
              })
            );
          }
        });
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), overpassProxyPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
