import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist/racha-app/browser');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = resolve(root, '.' + pathname);
      if (!file.startsWith(root + '/') && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () =>
    console.log('Progresium en http://127.0.0.1:4173'),
  );
