import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

function overpassProxyPlugin() {
  const MAX_BODY_SIZE = 64 * 1024;

  return {
    name: 'overpass-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/overpass', async (req: any, res: any, next: any) => {
        if (req.method !== 'POST') {
          return next();
        }

        let body = '';
        let bodyLength = 0;
        let isOverLimit = false;

        req.on('data', (chunk: any) => {
          if (isOverLimit) return;
          bodyLength += chunk.length;
          if (bodyLength > MAX_BODY_SIZE) {
            isOverLimit = true;
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'Payload Too Large: La consulta Overpass excede el límite máximo permitido de 64 KB.',
              })
            );
            req.destroy();
            return;
          }
          body += chunk.toString();
        });

        req.on('end', async () => {
          if (isOverLimit) return;
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
                    'User-Agent': 'GeoArc/1.4 (Architectural SIG Assistant)',
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

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), overpassProxyPlugin()],
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
