import {createServer} from 'node:http';
import {readFile, readFileSync} from 'node:fs';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const envPath = resolve(root, '.env');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {}

const port = Number(process.env.PORT || 3000);
const apiKey = process.env.BRAVE_API_KEY?.trim();
const searchTimestamps = [];
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxBytes = 12_000) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let size = 0;
    request.setEncoding('utf8');
    request.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        reject(Object.assign(new Error('La requête dépasse la taille autorisée.'), {status: 413}));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try { resolveBody(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Le corps JSON est invalide.'), {status: 400})); }
    });
    request.on('error', reject);
  });
}

function rateLimitReached() {
  const minuteAgo = Date.now() - 60_000;
  while (searchTimestamps.length && searchTimestamps[0] < minuteAgo) searchTimestamps.shift();
  if (searchTimestamps.length >= 5) return true;
  searchTimestamps.push(Date.now());
  return false;
}

async function runSearch(company) {
  const query = `${company} official company annual report financial results strategy sustainability technology news`;
  const endpoint = new URL('https://api.search.brave.com/res/v1/llm/context');
  endpoint.searchParams.set('q', query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetch(endpoint, {
      headers: {accept: 'application/json', 'x-subscription-token': apiKey},
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : response.status === 429 ? 429 : 502;
    const message = status === 503
      ? 'La clé Brave Search API est invalide ou inactive.'
      : status === 429
        ? 'Le quota ou la limite de requêtes Brave est atteint.'
        : 'Le fournisseur de recherche n’a pas répondu correctement.';
    throw Object.assign(new Error(message), {status});
  }
  const data = await response.json();
  const records = data.grounding?.generic || [];
  const sourceMetadata = data.sources || {};
  const seen = new Set();
  const sources = records.flatMap(record => {
    if (!record.url || seen.has(record.url)) return [];
    seen.add(record.url);
    const metadata = sourceMetadata[record.url] || {};
    return [{
      title: record.title || metadata.title || record.url,
      url: record.url,
      hostname: metadata.hostname || new URL(record.url).hostname,
      snippets: Array.isArray(record.snippets) ? record.snippets.slice(0, 2) : []
    }];
  });
  return {company, query, provider: 'Brave Search API', collectedAt: new Date().toISOString(), sources};
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return sendJson(response, 200, {searchConfigured: Boolean(apiKey), provider: 'Brave Search API'});
  }
  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    if (!apiKey) return sendJson(response, 503, {error: 'La clé BRAVE_API_KEY n’est pas configurée côté serveur. Ajoute-la au fichier .env, sans la publier.'});
    if (rateLimitReached()) return sendJson(response, 429, {error: 'Limite locale atteinte : maximum cinq recherches par minute.'});
    try {
      const payload = await readJson(request);
      const company = typeof payload.company === 'string' ? payload.company.trim() : '';
      if (company.length < 2 || company.length > 150) {
        return sendJson(response, 400, {error: 'Le nom de l’entreprise doit contenir entre 2 et 150 caractères.'});
      }
      const result = await runSearch(company);
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.status || 502, {error: error.status ? error.message : 'La collecte a échoué ou a expiré. Réessaie plus tard.'});
    }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, {error: 'Route API inconnue.'});

  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(root, `.${pathname}`);
  if (filePath !== root && !filePath.startsWith(root + sep)) return sendJson(response, 403, {error: 'Accès refusé.'});
  readFile(filePath, (error, contents) => {
    if (error) return sendJson(response, 404, {error: 'Fichier introuvable.'});
    response.writeHead(200, {'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff'});
    response.end(contents);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Veille prête sur http://localhost:${port}`);
  console.log(apiKey ? 'Brave Search API configuré.' : 'Recherche externe inactive : BRAVE_API_KEY manquante dans .env.');
});

