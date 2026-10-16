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
              'https://lz4.overpass-api.de/api/interpreter',
              'https://overpass.kumi.systems/api/interpreter',
              'https://overpass-api.de/api/interpreter',
              'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
            ];

            let lastError: any = null;
            for (const endpoint of endpoints) {
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 22000);
                const upstream = await fetch(endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'GeoArc/1.0 (architecture-urban-gis; contact@geoarc.app)',
                    'Accept': 'application/json'
                  },
                  body: 'data=' + encodeURIComponent(query),
                  signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (upstream.ok) {
                  const data = await upstream.text();
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(data);
                  return;
                } else {
                  lastError = new Error(`Upstream ${endpoint} status: ${upstream.status}`);
                }
              } catch (err: any) {
                lastError = err;
              }
            }

            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Todos los servidores Overpass fallaron', details: String(lastError) }));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Error interno en proxy Overpass', details: String(e) }));
          }
        });
      });
    }
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
