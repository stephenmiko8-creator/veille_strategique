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
  const box = document.querySelector('#readiness-box');
  box.classList.toggle('error', kind === 'error');
  box.classList.toggle('loading', kind === 'loading');
}

function renderResults(result) {
  const area = document.querySelector('#search-result-area');
  const sourceList = document.querySelector('#source-results');
  const answer = document.querySelector('#analysis-answer');
  const queryList = document.querySelector('#query-list');
  sourceList.replaceChildren();
  answer.textContent = result.answer || '';
  queryList.replaceChildren();
  if (result.searchQueries?.length) {
    const label = document.createElement('strong');
    label.textContent = 'Requêtes exécutées : ';
    queryList.append(label, document.createTextNode(result.searchQueries.join(' · ')));
  }
  const sources = Array.isArray(result.sources) ? result.sources : [];
  document.querySelector('#results-count').textContent = `${sources.length} source${sources.length > 1 ? 's' : ''} citée${sources.length > 1 ? 's' : ''}`;
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
    link.textContent = source.stageCode ? `[${source.stageCode}-${source.number || sourceList.children.length + 1}] ${source.title || url.hostname}` : `[${source.number || sourceList.children.length + 1}] ${source.title || url.hostname}`;
    const host = document.createElement('div');
    host.className = 'source-host';
    host.textContent = source.hostname || url.hostname;
    item.append(link, host);
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
    detail.textContent = analysis.sources?.length ? `${analysis.sources.length} source(s) citée(s) · À vérifier` : 'Recherche publique · Sources à collecter';
    info.append(title, detail);
    const date = document.createElement('span');
    date.className = 'analysis-date';
    date.textContent = analysis.date;
    const status = document.createElement('span');
    status.className = `status-pill ${analysis.answer && analysis.status !== 'error' ? '' : 'pending'}`;
    if (analysis.status === 'error') status.textContent = 'Étape à relancer';
    else if (analysis.status === 'searching') status.textContent = 'En cours';
    else if (analysis.answer) status.textContent = analysis.grounded ? 'Synthèse sourcée' : 'À vérifier';
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
  renderStageChecklist(analysis);
  document.querySelector('#retry-analysis').hidden = analysis.status !== 'error';
  document.querySelector('#search-result-area').hidden = true;
  document.querySelector('#source-results').replaceChildren();
  if (analysis.answer) {
    setReadiness({title: analysis.grounded ? 'Synthèse reliée aux sources' : 'Synthèse sans citation', description: analysis.grounded ? 'Les références et requêtes Google sont conservées pour contrôle.' : 'Gemini n’a retourné aucun lien de recherche vérifiable pour cette réponse.', kind: 'default', step: analysis.grounded ? 'SOURCÉE' : 'À CONTRÔLER', lead: 'Première synthèse automatique. Les chiffres et interprétations doivent être vérifiés avant toute décision.'});
    renderResults(analysis);
  } else if (analysis.status === 'searching') {
    setReadiness({title: 'Recherche en cours', description: 'Interrogation du moteur de recherche public.', kind: 'loading', step: 'EN COURS', lead: 'La collecte de sources est en cours.'});
  } else {
    setReadiness({title: 'Recherche non disponible', description: analysis.error || 'Vérifiez que le backend est lancé et que GEMINI_API_KEY est configurée dans le fichier .env.', kind: 'error', step: 'À CONFIGURER', lead: 'Aucune source n’a été collectée. Le système ne remplace pas les résultats absents par des données simulées.'});
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
      systemStatus.lastChild.textContent = ' Gemini configuré';
    } else {
      systemStatus.classList.add('disconnected');
      systemStatus.classList.remove('connected');
      systemStatus.lastChild.textContent = ' Clé Gemini à configurer';
    }
  } catch {
    systemStatus.classList.add('disconnected');
    systemStatus.lastChild.textContent = ' Backend à démarrer';
  }
}

const analysisStages = [
  {key: 'identify', label: 'Identification', element: '#identify-step-status'},
  {key: 'collect', label: 'Collecte', element: '#collection-step-status'},
  {key: 'analyze', label: 'Analyse', element: '#analysis-step-status'}
];

function renderStageChecklist(analysis, activeKey = '') {
  for (const stage of analysisStages) {
    const element = document.querySelector(stage.element);
    const result = (analysis.steps || []).find(item => item.key === stage.key);
    element.textContent = result ? 'TERMINÉE' : activeKey === stage.key ? 'EN COURS' : analysis.errorStage === stage.key ? 'ÉCHEC' : 'EN ATTENTE';
    element.className = result ? 'done-label' : 'pending-label';
  }
}

function composeStageResults(analysis) {
  const steps = analysis.steps || [];
  analysis.answer = steps.map(step => step.label.toUpperCase() + '\n' + step.answer).join('\n\n');
  analysis.sources = steps.flatMap(step => step.sources || []);
  analysis.searchQueries = steps.flatMap(step => step.searchQueries || []);
  analysis.grounded = analysis.sources.length > 0;
  analysis.collectedAt = steps.at(-1)?.collectedAt;
  analysis.provider = steps.at(-1)?.provider;
}

async function collectSources(analysis) {
  analysis.status = 'searching';
  analysis.error = '';
  analysis.errorStage = '';
  analysis.steps ||= [];
  document.querySelector('#retry-analysis').hidden = true;
  openAnalysis(analysis);
  try {
    for (const stage of analysisStages) {
      if (analysis.steps.some(item => item.key === stage.key)) continue;
      const previous = analysis.steps.map(item => 'ÉTAPE ' + item.label.toUpperCase() + '\n' + item.answer).join('\n\n');
      renderStageChecklist(analysis, stage.key);
      setReadiness({title: stage.label + ' en cours', description: 'Gemini consulte les sources publiques pour l’étape ' + stage.label.toLowerCase() + '.', kind: 'loading', step: 'EN COURS', lead: 'Étape ' + (analysis.steps.length + 1) + ' sur ' + analysisStages.length + ' : ' + stage.label + '.'});
      const response = await fetch('/api/analyze-step', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({company: analysis.name, id: analysis.id, stage: stage.key, context: previous})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || 'Le serveur a répondu ' + response.status + '.'), {stage: stage.key});
      analysis.steps.push(data);
      composeStageResults(analysis);
      analysis.date = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date());
      await saveAnalysis(analysis);
      renderStageChecklist(analysis);
    }
    analysis.status = 'collected';
    analysis.error = '';
    composeStageResults(analysis);
    setReadiness({title: 'Les trois étapes sont terminées', description: 'Identification, collecte et analyse ont été exécutées par Gemini avec des recherches Google distinctes.', kind: 'default', step: 'TERMINÉE', lead: 'Les références des différentes étapes sont conservées et identifiées dans la synthèse.'});
    renderResults(analysis);
    renderAnalyses();
    await saveAnalysis(analysis);
    await checkBackend();
  } catch (error) {
    analysis.status = 'error';
    analysis.error = error.message;
    analysis.errorStage = error.stage || analysisStages.find(stage => !analysis.steps.some(item => item.key === stage.key))?.key || '';
    renderStageChecklist(analysis);
    document.querySelector('#retry-analysis').hidden = false;
    setReadiness({title: 'Étape Gemini non terminée', description: error.message, kind: 'error', step: 'NON TERMINÉE', lead: 'Les étapes réussies restent enregistrées. Relance pour reprendre à l’étape en échec.'});
    await saveAnalysis(analysis);
    await checkBackend();
    renderAnalyses();
  }
}

async function saveAnalysis(analysis) {
  try {
    const response = await fetch('/api/analyses', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({analysis})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Stockage local indisponible.');
    Object.assign(analysis, data.analysis);
    renderAnalyses();
  } catch (error) {
    notify('Dossier non enregistré : ' + error.message);
  }
}

async function loadAnalyses() {
  try {
    const response = await fetch('/api/analyses');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Stockage local indisponible.');
    analyses = Array.isArray(data.analyses) ? data.analyses : [];
  } catch (error) {
    notify('Chargement des dossiers impossible : ' + error.message);
  }
  renderAnalyses();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = input.value.trim();
  if (name.length < 2) return;
  const failed = analyses.find(item => item.name.toLowerCase() === name.toLowerCase() && item.status === 'error');
  const analysis = failed || {id: crypto.randomUUID(), name, date: new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}).format(new Date()), sources: [], steps: [], status: 'searching'};
  if (failed) { analysis.error = ''; analysis.errorStage = ''; analysis.status = 'searching'; }
  analyses.unshift(analysis);
  renderAnalyses();
  input.value = '';
  await saveAnalysis(analysis);
  void collectSources(analysis);
});

document.querySelector('#retry-analysis').addEventListener('click', () => { if (activeAnalysis) void collectSources(activeAnalysis); });

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
document.querySelector('#nav-settings').addEventListener('click', event => { event.preventDefault(); notify('La clé Gemini se configure côté serveur dans .env.'); });
document.querySelector('#retry-analysis').hidden = true;
void loadAnalyses();
void checkBackend();

