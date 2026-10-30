import {createServer} from 'node:http';
import {readFile, readFileSync} from 'node:fs';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
try {
  const raw = readFileSync(resolve(root, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {}

const port = Number(process.env.PORT || 3000);
const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
const requestTimestamps = [];
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
  while (requestTimestamps.length && requestTimestamps[0] < minuteAgo) requestTimestamps.shift();
  if (requestTimestamps.length >= 5) return true;
  requestTimestamps.push(Date.now());
  return false;
}

function answerText(candidate) {
  return (candidate?.content?.parts || []).map(part => part.text || '').filter(Boolean).join('\n').trim();
}

function citationAnswer(text, supports) {
  let cited = text;
  const ordered = [...(supports || [])].sort((a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0));
  for (const support of ordered) {
    const end = support.segment?.endIndex;
    const ids = [...new Set(support.groundingChunkIndices || [])].filter(Number.isInteger);
    if (end === undefined || end < 0 || end > cited.length || !ids.length) continue;
    cited = `${cited.slice(0, end)} [${ids.map(id => id + 1).join(', ')}]${cited.slice(end)}`;
  }
  return cited;
}

async function runGroundedAnalysis(company) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json', 'x-goog-api-key': geminiApiKey},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: [
          'Tu es analyste de veille stratégique. Recherche des informations publiques actuelles avec Google Search et réponds en français.',
          'Commence par signaler si le nom de société est ambigu et n’attribue pas des données à une entité sans preuve.',
          'Sépare clairement les faits trouvés, leur source et leur date/période quand disponibles, puis les interprétations.',
          'Distingue signaux à traiter des éléments qui restent à surveiller. Relie les constats aux chiffres financiers uniquement si les sources donnent ces chiffres.',
          'N’invente aucun chiffre, causalité, intensité R&D, statut réglementaire ou citation. Mentionne les désaccords entre sources et les données qui manquent.',
          'Pour chaque affirmation vérifiable, utilise les citations fournies par la recherche. Termine par les limites de cette première collecte et les informations à demander à l’utilisateur.'
        ].join(' ')}]},
        contents: [{role: 'user', parts: [{text: `Fais une première veille stratégique sourcée sur l’entreprise « ${company} ». Couvre son identité et activité, ses informations financières récentes disponibles, ses marchés et concurrents, les évolutions technologiques, économiques, réglementaires et sociétales/environnementales pertinentes, puis les signaux à suivre. Ne transforme pas l’absence de données en hypothèse.`}]}],
        tools: [{google_search: {}}],
        generationConfig: {temperature: 0.2, maxOutputTokens: 5000}
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 503 : response.status === 429 ? 429 : 502;
    const message = status === 503
      ? 'La clé Gemini est invalide, non autorisée ou inactive. Vérifie sa restriction à l’API Gemini.'
      : status === 429
        ? 'La limite ou le quota Gemini est atteint.'
        : 'Gemini n’a pas pu répondre. Vérifie le modèle configuré et réessaie.';
    throw Object.assign(new Error(message), {status});
  }
  const data = await response.json();
  const candidate = data.candidates?.[0];
  const metadata = candidate?.groundingMetadata || {};
  const sources = (metadata.groundingChunks || []).flatMap((chunk, index) => {
    const web = chunk.web;
    if (!web?.uri) return [];
    let hostname = '';
    try { hostname = new URL(web.uri).hostname; } catch {}
    return [{number: index + 1, url: web.uri, title: web.title || hostname, hostname}];
  });
  const answer = answerText(candidate);
  if (!answer) throw Object.assign(new Error('Gemini a renvoyé une réponse vide ou bloquée.'), {status: 502});
  return {
    company,
    provider: 'Gemini API + Google Search',
    model,
    collectedAt: new Date().toISOString(),
    searchQueries: metadata.webSearchQueries || [],
    answer: citationAnswer(answer, metadata.groundingSupports),
    grounded: sources.length > 0,
    sources
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/status') {
    return sendJson(response, 200, {searchConfigured: Boolean(geminiApiKey), provider: 'Gemini API + Google Search', model});
  }
  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    if (!geminiApiKey) return sendJson(response, 503, {error: 'La variable GEMINI_API_KEY n’est pas configurée dans le fichier .env local.'});
    if (rateLimitReached()) return sendJson(response, 429, {error: 'Limite locale atteinte : maximum cinq analyses par minute.'});
    try {
      const payload = await readJson(request);
      const company = typeof payload.company === 'string' ? payload.company.trim() : '';
      if (company.length < 2 || company.length > 150) {
        return sendJson(response, 400, {error: 'Le nom de l’entreprise doit contenir entre 2 et 150 caractères.'});
      }
      const result = await runGroundedAnalysis(company);
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.status || 502, {error: error.status ? error.message : 'La collecte a échoué ou a expiré. Réessaie plus tard.'});
    }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, {error: 'Route API inconnue.'});

  let pathname;
  try { pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { return sendJson(response, 400, {error: 'Chemin invalide.'}); }
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
  console.log(geminiApiKey ? `Gemini configuré (${model}); les recherches partent sur demande.` : 'Gemini inactif : GEMINI_API_KEY manquante dans .env.');
});

