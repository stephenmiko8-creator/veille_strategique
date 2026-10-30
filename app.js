const form = document.querySelector('#company-form');
const input = document.querySelector('#company-name');
const list = document.querySelector('#analysis-list');
const empty = document.querySelector('#empty-state');
const dialog = document.querySelector('#analysis-dialog');
const count = document.querySelector('#analysis-count');
const toast = document.querySelector('#toast');
const systemStatus = document.querySelector('#system-status');
let analyses = [];
let activeAnalysis = null;
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function setReadiness({title, description, kind = 'default', step = 'EN ATTENTE', lead}) {
  document.querySelector('#readiness-title').textContent = title;
  document.querySelector('#readiness-description').textContent = description;
  document.querySelector('#dialog-lead').textContent = lead;
  document.querySelector('#collection-step-status').textContent = step;
  const box = document.querySelector('#readiness-box');
  box.classList.toggle('error', kind === 'error');
  box.classList.toggle('loading', kind === 'loading');
}

function renderResults(result) {
  const area = document.querySelector('#search-result-area');
  const sourceList = document.querySelector('#source-results');
  sourceList.replaceChildren();
  const sources = Array.isArray(result.sources) ? result.sources : [];
  document.querySelector('#results-count').textContent = `${sources.length} source${sources.length > 1 ? 's' : ''} trouvée${sources.length > 1 ? 's' : ''}`;
  document.querySelector('#results-date').textContent = `Collecte ${new Intl.DateTimeFormat('fr-FR', {dateStyle: 'short', timeStyle: 'short'}).format(new Date(result.collectedAt))}`;
  for (const source of sources) {
    let url;
    try { url = new URL(source.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const item = document.createElement('article');
    item.className = 'source-result';
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.title || url.hostname;
    const host = document.createElement('div');
    host.className = 'source-host';
    host.textContent = source.hostname || url.hostname;
    item.append(link, host);
    for (const snippet of (source.snippets || []).slice(0, 2)) {
      const text = document.createElement('p');
      text.textContent = snippet;
      item.append(text);
    }
    sourceList.append(item);
  }
  area.hidden = false;
}

function renderAnalyses() {
  count.textContent = analyses.length;
  empty.hidden = analyses.length > 0;
  list.querySelectorAll('.analysis-card').forEach(card => card.remove());
  for (const analysis of analyses) {
    const card = document.createElement('article');
    card.className = 'analysis-card';
    const logo = document.createElement('div');
    logo.className = 'analysis-logo';
    logo.textContent = initials(analysis.name);
    const info = document.createElement('div');
    info.className = 'analysis-info';
    const title = document.createElement('strong');
    title.textContent = analysis.name;
    const detail = document.createElement('span');
    detail.textContent = analysis.sources?.length ? `${analysis.sources.length} source(s) recueillie(s) · À vérifier` : 'Recherche publique · Sources à collecter';
    info.append(title, detail);
    const date = document.createElement('span');
    date.className = 'analysis-date';
    date.textContent = analysis.date;
    const status = document.createElement('span');
    status.className = `status-pill ${analysis.sources?.length ? '' : 'pending'}`;
    if (analysis.sources?.length) status.textContent = 'Sources reçues';
    else { const dot = document.createElement('i'); status.append(dot, document.createTextNode(' À compléter')); }
    card.append(logo, info, date, status);
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ouvrir le dossier ${analysis.name}`);
    card.addEventListener('click', () => openAnalysis(analysis));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAnalysis(analysis); }
    });
    list.append(card);
  }
}

function openAnalysis(analysis) {
  activeAnalysis = analysis;
  document.querySelector('#dialog-company').textContent = analysis.name;
  document.querySelector('#dialog-name-inline').textContent = analysis.name;
  document.querySelector('#search-result-area').hidden = true;
  document.querySelector('#source-results').replaceChildren();
  if (analysis.sources?.length) {
    setReadiness({title: 'Résultats de recherche reçus', description: 'Les extraits et URLs ci-dessous sont des pistes à contrôler sur les sources originales.', kind: 'default', step: 'REÇUES', lead: 'La collecte a retourné des sources publiques. Aucune conclusion financière ou stratégique n’est générée à ce stade.'});
    renderResults(analysis);
  } else if (analysis.status === 'searching') {
    setReadiness({title: 'Recherche en cours', description: 'Interrogation du moteur de recherche public.', kind: 'loading', step: 'EN COURS', lead: 'La collecte de sources est en cours.'});
  } else {
    setReadiness({title: 'Recherche non disponible', description: analysis.error || 'Vérifiez que le backend est lancé et que la clé Brave est configurée dans le fichier .env.', kind: 'error', step: 'À CONFIGURER', lead: 'Aucune source n’a été collectée. Le système ne remplace pas les résultats absents par des données simulées.'});
  }
  if (!dialog.open) dialog.showModal();
}

async function checkBackend() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (data.searchConfigured) {
      systemStatus.classList.remove('disconnected');
      systemStatus.classList.add('connected');
      systemStatus.lastChild.textContent = ' Recherche connectée';
    } else {
      systemStatus.classList.add('disconnected');
      systemStatus.classList.remove('connected');
      systemStatus.lastChild.textContent = ' Clé de recherche à configurer';
    }
  } catch {
    systemStatus.classList.add('disconnected');
    systemStatus.lastChild.textContent = ' Backend à démarrer';
  }
}

async function collectSources(analysis) {
  analysis.status = 'searching';
  openAnalysis(analysis);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({company: analysis.name})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Le serveur a répondu ${response.status}.`);
    analysis.status = 'collected';
    analysis.sources = data.sources || [];
    analysis.collectedAt = data.collectedAt;
    analysis.provider = data.provider;
    analysis.date = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date());
    openAnalysis(analysis);
    renderAnalyses();
    await checkBackend();
  } catch (error) {
    analysis.status = 'error';
    analysis.error = error.message;
    setReadiness({title: 'Recherche non terminée', description: error.message, kind: 'error', step: 'NON TERMINÉE', lead: 'Aucune source validée n’a été ajoutée au dossier.'});
    await checkBackend();
    renderAnalyses();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const name = input.value.trim();
  if (name.length < 2) return;
  const analysis = {name, date: new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date()), sources: [], status: 'searching'};
  analyses.unshift(analysis);
  renderAnalyses();
  input.value = '';
  void collectSources(analysis);
});

document.querySelector('#dialog-done').addEventListener('click', () => dialog.close());
document.querySelector('#copy-brief').addEventListener('click', async () => {
  const name = activeAnalysis?.name || document.querySelector('#dialog-company').textContent;
  const brief = `Analyse stratégique de ${name}.\nObjectif : collecter des sources publiques récentes, dater chaque fait, comparer les données contradictoires sans arbitrage automatique, demander validation à l'utilisateur, puis analyser les signaux multidimensionnels en lien avec les données financières. Signaler les données manquantes et distinguer les faits vérifiés des interprétations.`;
  try { await navigator.clipboard.writeText(brief); notify('Brief d’analyse copié.'); }
  catch { notify('Copie indisponible dans ce navigateur.'); }
});

document.querySelector('#how-it-works').addEventListener('click', () => notify('Collecte sourcée → recoupement → validation → analyse.'));
document.querySelector('#show-all').addEventListener('click', () => document.querySelector('#analyses').scrollIntoView({behavior: 'smooth'}));
document.querySelector('#nav-analyses').addEventListener('click', event => { event.preventDefault(); document.querySelector('#analyses').scrollIntoView({behavior: 'smooth'}); });
document.querySelector('#nav-sources').addEventListener('click', event => { event.preventDefault(); notify('Les résultats de chaque collecte sont affichés dans le dossier correspondant.'); });
document.querySelector('#nav-settings').addEventListener('click', event => { event.preventDefault(); notify('La clé Brave se configure côté serveur dans .env.'); });
renderAnalyses();
void checkBackend();

