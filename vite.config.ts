import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

const WRAPPER_META_FILES = new Set([
  'package.json',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'tsconfig.json',
  'metadata.json',
  'vite.config.ts',
  'vite.config.mjs',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.aistudio',
  '.build-outputs',
  'public',
]);

function discoverHtmlInputs(
  dir: string,
  baseDir: string = dir,
  inputs: Record<string, string> = {}
): Record<string, string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      discoverHtmlInputs(full, baseDir, inputs);
    } else if (entry.endsWith('.html')) {
      const rel = relative(baseDir, full).replace(/\\/g, '/');
      const key =
        rel === 'index.html'
          ? 'main'
          : rel.replace(/\.html$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
      inputs[key] = full;
    }
  }
  return inputs;
}

interface ImportmapTable {
  exact: Map<string, string>;
  prefixes: Array<[string, string]>;
}

function parseImportmaps(htmlInputs: Record<string, string>): ImportmapTable {
  const exact = new Map<string, string>();
  const prefixes: Array<[string, string]> = [];
  const re = /<script\b[^>]*\btype\s*=\s*['"]importmap['"][^>]*>([\s\S]*?)<\/script>/gi;
  for (const file of Object.values(htmlInputs)) {
    try {
      const html = readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = re.exec(html)) !== null) {
        const parsed = JSON.parse(match[1]);
        const imports = parsed && typeof parsed.imports === 'object' ? parsed.imports : {};
        for (const [key, val] of Object.entries(imports)) {
          if (typeof val !== 'string') continue;
          if (key.endsWith('/')) {
            prefixes.push([key, val]);
          } else {
            exact.set(key, val);
          }
        }
      }
    } catch {
      // Ignore malformed importmap blocks.
    }
  }
  return { exact, prefixes };
}

function resolveImportmapSpecifier(id: string, table: ImportmapTable): string | null {
  if (table.exact.has(id)) {
    return table.exact.get(id) ?? null;
  }
  for (const [prefix, targetPrefix] of table.prefixes) {
    if (id.startsWith(prefix)) {
      return targetPrefix + id.slice(prefix.length);
    }
  }
  return null;
}

function hoistImportmapsFirst(html: string): string {
  const importmapRe = /<script\b[^>]*\btype\s*=\s*['"]importmap['"][^>]*>[\s\S]*?<\/script>/gi;
  const blocks: string[] = [];
  const stripped = html.replace(importmapRe, (m) => {
    blocks.push(m);
    return '';
  });
  if (blocks.length === 0) return html;
  const headMatch = /<head\b[^>]*>/i.exec(stripped);
  if (!headMatch) {
    return blocks.join('\n') + '\n' + stripped;
  }
  const insertPos = headMatch.index + headMatch[0].length;
  return (
    stripped.slice(0, insertPos) +
    '\n  ' +
    blocks.join('\n  ') +
    stripped.slice(insertPos)
  );
}

function aisSyncStaticAndImportmapPlugin(table: ImportmapTable): Plugin {
  return {
    name: 'ais-sync-static-and-importmap',
    enforce: 'pre',
    resolveId(id: string) {
      const mapped = resolveImportmapSpecifier(id, table);
      if (!mapped) return null;
      if (
        mapped.startsWith('http://') ||
        mapped.startsWith('https://') ||
        mapped.startsWith('//') ||
        mapped.startsWith('data:')
      ) {
        return { id: mapped, external: true };
      }
      return { id, external: true };
    },
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        return hoistImportmapsFirst(html);
      },
    },
    closeBundle() {
      const outDir = resolve(rootDir, 'dist');
      function walk(dir: string): void {
        for (const entry of readdirSync(dir)) {
          if (SKIP_DIRS.has(entry) || WRAPPER_META_FILES.has(entry) || entry.startsWith('.')) {
            continue;
          }
          const full = join(dir, entry);
          const st = statSync(full);
          if (st.isDirectory()) {
            walk(full);
          } else if (
            !entry.endsWith('.html') &&
            !entry.endsWith('.ts') &&
            !entry.endsWith('.tsx')
          ) {
            const rel = relative(rootDir, full);
            const dest = join(outDir, rel);
            if (!existsSync(dest)) {
              mkdirSync(dirname(dest), { recursive: true });
              cpSync(full, dest);
            }
          }
        }
      }
      walk(rootDir);
    },
  };
}

function attachCompressionAndCdnMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Vary', 'Accept-Encoding');

  const url = req.url || '/';
  if (/\.(jpg|jpeg|png|webp|svg|mp4|woff2?)$/i.test(url)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('CDN-Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('CDN-Cache-Control', 'public, max-age=86400');
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip')) {
    next();
    return;
  }

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  const chunks: Buffer[] = [];

  res.write = ((chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean => {
    if (chunk) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encodingOrCb === 'string' ? (encodingOrCb as BufferEncoding) : 'utf-8');
      chunks.push(buf);
    }
    if (typeof encodingOrCb === 'function') (encodingOrCb as () => void)();
    else if (typeof cb === 'function') (cb as () => void)();
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: unknown, encodingOrCb?: unknown, cb?: unknown): ServerResponse => {
    if (chunk && typeof chunk !== 'function') {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), typeof encodingOrCb === 'string' ? (encodingOrCb as BufferEncoding) : 'utf-8');
      chunks.push(buf);
    }
    const body = Buffer.concat(chunks);
    const contentType = String(res.getHeader('Content-Type') || '');
    const isCompressible =
      /text\/html|text\/css|javascript|application\/json|application\/xml|text\/xml|image\/svg\+xml/i.test(contentType) ||
      url === '/' ||
      url.endsWith('.html');

    if (isCompressible && body.length > 512 && !res.getHeader('Content-Encoding')) {
      const gz = gzipSync(body, { level: 6 });
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', String(gz.length));
      origWrite(gz);
      return origEnd(typeof encodingOrCb === 'function' ? encodingOrCb : (cb as (() => void) | undefined));
    }

    if (body.length > 0) {
      res.setHeader('Content-Length', String(body.length));
      origWrite(body);
    }
    return origEnd(typeof encodingOrCb === 'function' ? encodingOrCb : (cb as (() => void) | undefined));
  }) as typeof res.end;

  next();
}

function aisSeoCdnGzipPlugin(): Plugin {
  return {
    name: 'ais-seo-cdn-gzip-headers',
    configureServer(server) {
      server.middlewares.use(attachCompressionAndCdnMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(attachCompressionAndCdnMiddleware);
    },
  };
}

const htmlInputs = discoverHtmlInputs(rootDir);
const importmapTable = parseImportmaps(htmlInputs);

export default defineConfig({
  appType: 'mpa',
  base: './',
  plugins: [aisSeoCdnGzipPlugin(), aisSyncStaticAndImportmapPlugin(importmapTable)],
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      input: htmlInputs,
      external: (id: string) => resolveImportmapSpecifier(id, importmapTable) !== null,
    },
  },
});

