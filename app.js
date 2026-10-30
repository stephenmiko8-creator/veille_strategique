const form = document.querySelector('#company-form');
const input = document.querySelector('#company-name');
const list = document.querySelector('#analysis-list');
const empty = document.querySelector('#empty-state');
const dialog = document.querySelector('#analysis-dialog');
const count = document.querySelector('#analysis-count');
const toast = document.querySelector('#toast');
let analyses = [];
let activeCompany = '';
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function renderAnalyses() {
  count.textContent = analyses.length;
  if (!analyses.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.querySelectorAll('.analysis-card').forEach(card => card.remove());
  analyses.forEach((analysis, index) => {
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
    detail.textContent = 'Collecte externe à configurer · Prototype';
    info.append(title, detail);
    const date = document.createElement('span');
    date.className = 'analysis-date';
    date.textContent = analysis.date;
    const status = document.createElement('span');
    status.className = 'status-pill pending';
    const statusDot = document.createElement('i');
    status.append(statusDot, document.createTextNode(' En préparation'));
    card.append(logo, info, date, status);
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ouvrir le dossier ${analysis.name}`);
    card.addEventListener('click', () => openAnalysis(analysis.name));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAnalysis(analysis.name); }
    });
    list.append(card);
  });
}

function openAnalysis(name) {
  activeCompany = name;
  document.querySelector('#dialog-company').textContent = name;
  document.querySelector('#dialog-name-inline').textContent = name;
  dialog.showModal();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  const existing = analyses.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!existing) analyses.unshift({ name, date: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()) });
  renderAnalyses();
  input.value = '';
  openAnalysis(name);
});

document.querySelector('#dialog-done').addEventListener('click', () => dialog.close());
document.querySelector('#copy-brief').addEventListener('click', async () => {
  const brief = `Analyse stratégique de ${activeCompany}.\nObjectif : collecter des sources publiques récentes, dater chaque fait, comparer les données contradictoires sans arbitrage automatique, demander validation à l'utilisateur, puis analyser les signaux multidimensionnels en lien avec les données financières. Signaler les données manquantes et distinguer les faits vérifiés des interprétations.`;
  try {
    await navigator.clipboard.writeText(brief);
    notify('Brief d’analyse copié.');
  } catch {
    notify('Copie indisponible dans ce navigateur.');
  }
});

document.querySelector('#how-it-works').addEventListener('click', () => notify('Collecte → recoupement → analyse → rapport sourcé.'));
document.querySelector('#show-all').addEventListener('click', () => document.querySelector('#analyses').scrollIntoView({ behavior: 'smooth' }));
document.querySelector('#nav-analyses').addEventListener('click', event => { event.preventDefault(); document.querySelector('#analyses').scrollIntoView({ behavior: 'smooth' }); });
document.querySelector('#nav-sources').addEventListener('click', event => { event.preventDefault(); notify('Les connecteurs de sources seront configurés dans la prochaine étape.'); });
document.querySelector('#nav-settings').addEventListener('click', event => { event.preventDefault(); notify('Configuration des sources et du moteur à venir.'); });
renderAnalyses();

