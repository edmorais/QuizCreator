'use strict';

// ---------------------------------------------------------------------------
// Preferências locais (vista e tema de cores)
// ---------------------------------------------------------------------------

const PREFS_KEY = 'quizcreator.prefs';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
}

function savePref(key, value) {
  const prefs = loadPrefs();
  prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* sem armazenamento */ }
}

let view = loadPrefs().view === 'order' ? 'order' : 'themes';

// ---------------------------------------------------------------------------
// Tema de cores: automático → claro → escuro
// ---------------------------------------------------------------------------

const COLOR_MODES = {
  auto: { icon: '◐', label: 'Tema: automático (segue o sistema)' },
  light: { icon: '☀', label: 'Tema: claro' },
  dark: { icon: '☾', label: 'Tema: escuro' },
};

function applyColorMode(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
  const btn = $('#btn-theme');
  btn.textContent = COLOR_MODES[mode].icon;
  btn.title = COLOR_MODES[mode].label + ' — clica para mudar';
  btn.setAttribute('aria-label', COLOR_MODES[mode].label);
}

let colorMode = COLOR_MODES[loadPrefs().color] ? loadPrefs().color : 'auto';
applyColorMode(colorMode);
$('#btn-theme').onclick = () => {
  const modes = Object.keys(COLOR_MODES);
  colorMode = modes[(modes.indexOf(colorMode) + 1) % modes.length];
  savePref('color', colorMode);
  applyColorMode(colorMode);
};

// ---------------------------------------------------------------------------
// Paleta da interface (as 14 predefinições do BoldKit; as cores estão no CSS)
// ---------------------------------------------------------------------------

const PALETTES = [
  { id: 'coral', name: 'Coral', swatch: ['#f37373', '#4fd1c2', '#ffe46b'] },
  { id: 'purple', name: 'Purple', swatch: ['#8a2ce2', '#e84aa5', '#0ea2e7'] },
  { id: 'forest', name: 'Forest', swatch: ['#24c278', '#a1da3e', '#ffd633'] },
  { id: 'ocean', name: 'Ocean', swatch: ['#0ea2e7', '#4fd1c2', '#7ae6b4'] },
  { id: 'sunset', name: 'Sunset', swatch: ['#ff6a24', '#e84aa5', '#ffd633'] },
  { id: 'mono', name: 'Mono', swatch: ['#e6e6e6', '#bfbfbf', '#ffdd4d'] },
  { id: 'neon', name: 'Neon', swatch: ['#ff00c8', '#00ffff', '#ffff00'] },
  { id: 'electric', name: 'Electric', swatch: ['#824dff', '#00ffd0', '#ffc61a'] },
  { id: 'candy', name: 'Candy', swatch: ['#ef5d8d', '#a35ce0', '#33ddff'] },
  { id: 'cyberpunk', name: 'Cyberpunk', swatch: ['#3dff14', '#ff2e63', '#00c3ff'] },
  { id: 'retro', name: 'Retro', swatch: ['#e9670b', '#4bb3a7', '#f6c945'] },
  { id: 'pastel', name: 'Pastel', swatch: ['#ffa3bd', '#a8e6cc', '#c6b9ec'] },
  { id: 'gold', name: 'Gold', swatch: ['#f0be28', '#2c416d', '#eb9c19'] },
  { id: 'cherry', name: 'Cherry', swatch: ['#c33528', '#23503a', '#f29b13'] },
];

function applyPalette(id) {
  const palette = PALETTES.find(p => p.id === id) || PALETTES[0];
  document.documentElement.dataset.palette = palette.id;
  $('#palette-list').replaceChildren(...PALETTES.map(p => el('button', {
    type: 'button', class: p.id === palette.id ? 'current' : '', 'aria-pressed': String(p.id === palette.id),
    onclick: () => { savePref('palette', p.id); applyPalette(p.id); $('#palette-menu').open = false; },
  }, el('span', { class: 'swatches', 'aria-hidden': 'true' }, ...p.swatch.map(c => el('i', { style: `background:${c}` }))), p.name)));
}

applyPalette(loadPrefs().palette);

// ---------------------------------------------------------------------------
// Apresentação: na primeira vez que se abre a aplicação, e em Ficheiro › Sobre e dados
// ---------------------------------------------------------------------------

$('#welcome').addEventListener('close', () => savePref('welcomed', true));
$('#btn-about').onclick = () => {
  $('#btn-about').closest('details').open = false;
  $('#welcome').showModal();
};
if (!loadPrefs().welcomed) $('#welcome').showModal();

// ---------------------------------------------------------------------------
// Avisos breves (toast), com ação opcional
// ---------------------------------------------------------------------------

let toastTimer = null;

function toast(message, action) {
  const box = $('#toast');
  box.replaceChildren(
    el('span', {}, message),
    action ? el('button', { type: 'button', onclick: () => { box.hidden = true; action.run(); } }, action.label) : null,
  );
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, action ? 9000 : 4000);
}

// ---------------------------------------------------------------------------
// Desfazer operações sobre o quiz inteiro (preencher, baralhar, novo, importar)
// ---------------------------------------------------------------------------

const quizUndo = []; // [{label, snapshot}]

function pushQuizUndo(label) {
  quizUndo.push({ label, snapshot: structuredClone(quiz) });
  if (quizUndo.length > 20) quizUndo.shift();
  renderUndoButton();
}

function popQuizUndo() {
  const u = quizUndo.pop();
  if (!u) return;
  quiz = u.snapshot;
  save();
  render();
  toast(`Desfeito: ${u.label}`);
}

function renderUndoButton() {
  const btn = $('#btn-undo');
  const last = quizUndo[quizUndo.length - 1];
  btn.disabled = !last;
  btn.title = last ? `Desfazer: ${last.label} (Ctrl+Z)` : 'Nada para desfazer';
}

$('#btn-undo').onclick = popQuizUndo;
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const inField = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
  if (document.querySelector('dialog[open]') || inField) return;
  if (!quizUndo.length) return;
  e.preventDefault();
  popQuizUndo();
});

// ---------------------------------------------------------------------------
// Vistas: por tema (grelha) / ordem do quiz
// ---------------------------------------------------------------------------

function setView(v) {
  view = v;
  savePref('view', v);
  renderView();
}

function spreadText() {
  const w = spreadWindow(quiz);
  return w < 2 ? 'sem regra de repetição' : w === 2 ? 'o mesmo tema nunca aparece em perguntas seguidas' : `em ${w} perguntas seguidas não se repete o tema`;
}

function renderView() {
  $('#grid-wrap').hidden = view !== 'themes';
  $('#order-view').hidden = view !== 'order';
  $('#config-view').hidden = view !== 'config';
  $('#specials-wrap').classList.toggle('hidden-in-config', view === 'config');
  ['themes', 'order', 'config'].forEach(v => $(`#view-${v}`).setAttribute('aria-pressed', String(view === v)));
  $('#view-hint').textContent = view === 'themes'
    ? 'Arrasta para trocar a posição dentro do tema · duplo-clique no tema para o renomear'
    : view === 'order' ? `Arrasta para mudar a ordem · ${spreadText()}` : 'As alterações aplicam-se a este quiz';
  if (view === 'order') renderOrderView();
  if (view === 'config') renderConfig();
}

$('#view-themes').onclick = () => setView('themes');
$('#view-order').onclick = () => setView('order');
$('#view-config').onclick = () => setView('config');

let orderDrag = null; // índice na ordem a ser arrastado

function renderOrderView() {
  const p = quiz.presentation;
  const mixed = p.mode === 'mixed';
  const order = presentationOrder(quiz);
  const checking = quiz.config.checks.order && spreadWindow(quiz) >= 2;
  const conflicts = mixed && checking ? orderConflicts(quiz, order) : new Set();

  $('#ov-mode').value = p.mode;
  renderRoundsSelect($('#ov-rounds-count'));
  $('#ov-size-wrap').hidden = !mixed;
  const status = $('#ov-status');
  status.className = 'ov-status ' + (!mixed || !checking ? '' : conflicts.size ? 'bad' : 'ok');
  status.textContent = !mixed
    ? 'Agrupada por tema: usa “Baralhar ordem” para misturar.'
    : !checking ? 'Regra de repetição desligada.'
      : conflicts.size ? `⚠ ${clashText(conflicts.size)}` : `✓ Regra cumprida: ${spreadText()}`;

  const index = new Map(order.map((k, i) => [k, i]));
  const sections = rounds(quiz).map(r => el('section', { class: 'ov-round' },
    el('header', { class: 'ov-round-head' }, el('strong', {}, r.title), el('span', {}, r.subtitle)),
    el('div', { class: 'ov-list' }, r.items.map(it => orderCard(it, index.get(it.key), conflicts.has(index.get(it.key))))),
  ));
  $('#ov-rounds').replaceChildren(...sections);
}

// Número de rondas na ordem misturada: de 1 até uma ronda por pergunta (máx. 20 opções úteis).
function renderRoundsSelect(select) {
  const total = themedTotal(quiz);
  const max = Math.min(total, 20);
  select.replaceChildren(...Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    const size = Math.ceil(total / n);
    return el('option', { value: String(n) }, `${n} ${n === 1 ? 'ronda' : 'rondas'} (${size === Math.floor(total / n) ? size : `${Math.floor(total / n)}–${size}`} perguntas)`);
  }));
  select.value = String(Math.min(max, quiz.presentation.rounds));
}

function clashText(n) {
  const w = spreadWindow(quiz);
  const rule = w === 2 ? 'repete o tema da pergunta anterior' : `repete o tema em ${w} seguidas`;
  return n === 1 ? `1 pergunta ${rule}` : `${n} perguntas ${rule.replace('repete', 'repetem')}`;
}

function orderCard(it, index, clash) {
  const ref = { kind: 'theme', t: it.t, q: parseKey(it.key).q };
  const q = it.q;
  const state = isFilled(q) ? 'filled' : isStarted(q) ? 'partial' : 'empty';
  const node = el('div', {
    class: `ov-card ${state}${clash ? ' clash' : ''}`, style: `--c:${it.color}`, tabindex: '0', draggable: 'true',
    title: clash ? `O tema “${it.themeName}” já apareceu nas ${spreadWindow(quiz) - 1} perguntas anteriores` : it.themeName,
    onclick: () => openEditor(ref),
    onkeydown: e => { if (e.key === 'Enter') openEditor(ref); },
  },
    el('div', { class: 'ov-top' },
      el('span', { class: 'n' }, String(it.n)),
      el('span', { class: 'chip' }, it.themeName),
      clash ? el('span', { class: 'clash-mark' }, '⚠') : null,
    ),
    el('div', { class: 'q' }, q.question.trim() || 'vazia'),
    el('div', { class: 'a' }, answerOf(q) ? '→ ' + answerOf(q) : ''),
  );
  node.addEventListener('dragstart', e => {
    orderDrag = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-quiz-order', String(index));
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => {
    orderDrag = null;
    node.classList.remove('dragging');
    document.querySelectorAll('.ov-card.drop-before, .ov-card.drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after'));
  });
  node.addEventListener('dragover', e => {
    if (orderDrag === null) return;
    e.preventDefault();
    node.classList.toggle('drop-before', orderDrag > index);
    node.classList.toggle('drop-after', orderDrag < index);
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-before', 'drop-after'));
  node.addEventListener('drop', e => {
    if (orderDrag === null) return;
    e.preventDefault();
    e.stopPropagation();
    moveInOrder(orderDrag, index);
  });
  return node;
}

// Move a pergunta da posição `from` para a posição `to` (as outras deslizam).
function moveInOrder(from, to) {
  if (from === to) return;
  const p = quiz.presentation;
  if (p.mode !== 'mixed') {
    p.order = themeOrder(quiz);
    p.mode = 'mixed';
  }
  const [key] = p.order.splice(from, 1);
  p.order.splice(to, 0, key);
  save();
  render();
}

$('#ov-mode').addEventListener('change', e => {
  pushQuizUndo('mudar o tipo de ordem');
  quiz.presentation.mode = e.target.value;
  save();
  render();
});
$('#ov-rounds-count').addEventListener('change', e => {
  quiz.presentation.rounds = Number(e.target.value);
  save();
  render();
});

// ---------------------------------------------------------------------------
// Baralhar a ordem
// ---------------------------------------------------------------------------

function shuffleOrder() {
  pushQuizUndo('baralhar a ordem');
  quiz.presentation.mode = 'mixed';
  quiz.presentation.order = mixedOrder(quiz);
  save();
  if (view !== 'order') setView('order');
  render();
  toast(`Ordem baralhada: ${spreadText()}.`, { label: 'Desfazer', run: popQuizUndo });
}

$('#btn-shuffle').onclick = shuffleOrder;

// ---------------------------------------------------------------------------
// Preencher o quiz com perguntas aleatórias do banco
// ---------------------------------------------------------------------------

// Mistura de dificuldades por tema: o mais equilibrado possível, com médias a mais se não der certo.
function fillDifficulty(perTheme) {
  const base = Math.floor(perTheme / 3);
  const rest = perTheme % 3;
  return { '1': base + (rest === 2 ? 1 : 0), '2': base + (rest > 0 ? 1 : 0), '3': base };
}

// Correspondências por tema: no máximo uma por cada seis perguntas.
function fillMaxMatch(perTheme) { return Math.max(1, Math.round(perTheme / 6)); }

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slots que o preenchimento vai ocupar.
function fillTargets(replace, specials) {
  return allRefs().filter(r => {
    if (r.kind !== 'theme' && !specials) return false;
    return replace || !isStarted(getSlot(r));
  });
}

function fillQuiz({ replace, specials }) {
  const targets = fillTargets(replace, specials);
  if (!targets.length) return { filled: 0, missing: [] };
  const isTarget = r => targets.some(x => sameRef(x, r));
  const kept = allRefs().filter(r => !isTarget(r)).map(getSlot).filter(q => questionText(q).trim());
  const takenIds = new Set(kept.map(q => q.id));
  const takenTokens = kept.map(q => tokens(questionText(q)));

  // Evita pergunta igual ou muito parecida com uma que já esteja (ou vá ficar) no quiz.
  const tooSimilar = e => {
    const tok = tokens(questionText(e.q));
    return takenTokens.some(t => similarityOf(tok, t) >= SIMILARITY_THRESHOLD);
  };
  const take = (themeId, tiers) => {
    const pool = bank.filter(e => e.theme === themeId && !e.uses.length && !takenIds.has(e.id));
    for (const ok of tiers) {
      const pick = shuffled(pool.filter(ok)).find(e => !tooSimilar(e));
      if (pick) {
        takenIds.add(pick.id);
        takenTokens.push(tokens(questionText(pick.q)));
        return pick;
      }
    }
    return null;
  };

  const missing = [];
  const put = (ref, entry) => {
    const slot = getSlot(ref);
    for (const k of Object.keys(slot)) delete slot[k];
    Object.assign(slot, entryCopy(entry));
  };
  let filled = 0;

  for (const sp of enabledSpecials(quiz)) {
    const ref = { kind: 'special', id: sp.id };
    if (!isTarget(ref)) continue;
    const e = take(specialBankId(sp), [() => true]);
    if (e) { put(ref, e); filled++; } else missing.push(sp.name);
  }

  quiz.themes.forEach((theme, t) => {
    const slots = targets.filter(r => r.kind === 'theme' && r.t === t);
    if (!slots.length) return;
    const staying = theme.questions.filter((q, qi) => !slots.some(s => s.q === qi) && isStarted(q));

    // Dificuldades que faltam para chegar à mistura pretendida.
    const need = fillDifficulty(quiz.perTheme);
    staying.forEach(q => { if (need[q.difficulty] > 0) need[q.difficulty]--; });
    let wanted = shuffled(Object.entries(need).flatMap(([d, n]) => Array(n).fill(d)));
    while (wanted.length < slots.length) wanted.push(String(1 + Math.floor(Math.random() * 3)));
    wanted = wanted.slice(0, slots.length);

    let matches = staying.filter(q => q.type === 'match').length;
    // Etiquetas que as regras pedem para este tema, e quantas ainda faltam.
    const tagNeed = new Map();
    quiz.config.rules.filter(r => r.theme === theme.id).forEach(r => {
      const left = r.min - staying.filter(q => hasTag(q, r.tag)).length;
      if (left > 0) tagNeed.set(r.tag, Math.max(tagNeed.get(r.tag) || 0, left));
    });
    const chosen = [];
    const maxMatch = fillMaxMatch(quiz.perTheme);
    for (const d of wanted) {
      const noMatch = e => matches < maxMatch || e.q.type !== 'match';
      const tagged = e => ![...tagNeed].some(([, n]) => n > 0) || [...tagNeed].some(([tag, n]) => n > 0 && hasTag(e.q, tag));
      // Do mais exigente para o mais tolerante, se o banco não tiver o suficiente.
      const e = take(theme.id, [
        e => e.q.difficulty === d && noMatch(e) && tagged(e),
        e => noMatch(e) && tagged(e),
        e => noMatch(e),
        () => true,
      ]);
      if (!e) continue;
      if (e.q.type === 'match') matches++;
      tagNeed.forEach((n, tag) => { if (hasTag(e.q, tag)) tagNeed.set(tag, n - 1); });
      chosen.push(e);
    }
    if (chosen.length < slots.length) missing.push(`${theme.name} (${slots.length - chosen.length})`);
    // Ao substituir o tema todo, ordena do mais fácil para o mais difícil.
    if (slots.length === quiz.perTheme) chosen.sort((a, b) => (a.q.difficulty || '2').localeCompare(b.q.difficulty || '2'));
    chosen.forEach((e, i) => { put(slots[i], e); filled++; });
  });

  return { filled, missing };
}

const fillDialog = $('#fill-dialog');

function updateFillSummary() {
  const replace = fillDialog.querySelector('input[name="fill-mode"]:checked').value === 'all';
  const specials = $('#fill-specials').checked;
  const targets = fillTargets(replace, specials);
  // Temas (ou especiais) sem nenhuma pergunta por usar no banco.
  const empty = [...new Set(targets.map(themeIdOfRef))]
    .filter(id => !bank.some(e => e.theme === id && !e.uses.length))
    .map(id => themeInfo(id).name);
  const possible = targets.filter(r => !empty.includes(themeInfo(themeIdOfRef(r)).name)).length;
  const note = empty.length ? ` Sem perguntas no banco: ${empty.join(', ')}.` : '';
  $('#fill-summary').textContent = !targets.length
    ? 'Não há células vazias. Escolhe “Substituir todas” para sortear um quiz novo.'
    : possible
      ? `Vão ser escolhidas ${possible} perguntas do banco.${note}`
      : `Nada a preencher.${note}`;
  $('#fill-go').disabled = possible === 0;
}

$('#btn-fill').onclick = () => {
  const anyEmpty = fillTargets(false, true).length > 0;
  fillDialog.querySelector(`input[name="fill-mode"][value="${anyEmpty ? 'empty' : 'all'}"]`).checked = true;
  const mix = fillDifficulty(quiz.perTheme);
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  $('#fill-rule-mix').textContent = `Em cada tema: ${count(mix[1], 'fácil', 'fáceis')}, ${count(mix[2], 'média', 'médias')} e ${count(mix[3], 'difícil', 'difíceis')}`;
  const maxMatch = fillMaxMatch(quiz.perTheme);
  const rules = quiz.config.rules.filter(r => quiz.themes.some(t => t.id === r.theme))
    .map(r => `${count(r.min, 'pergunta', 'perguntas')} “${r.tag}” em ${themeInfo(r.theme).name}`);
  $('#fill-rule-match').textContent = `No máximo ${count(maxMatch, 'correspondência', 'correspondências')} por tema`
    + (rules.length ? `, e pelo menos ${rules.join('; ')}` : '');
  updateFillSummary();
  fillDialog.showModal();
};
fillDialog.addEventListener('change', updateFillSummary);
fillDialog.addEventListener('close', () => {
  if (fillDialog.returnValue !== 'ok') return;
  const replace = fillDialog.querySelector('input[name="fill-mode"]:checked').value === 'all';
  pushQuizUndo(replace ? 'sortear o quiz todo' : 'preencher as vazias');
  const { filled, missing } = fillQuiz({ replace, specials: $('#fill-specials').checked });
  save();
  render();
  const extra = missing.length ? ` Faltaram perguntas por usar em: ${missing.join(', ')}.` : '';
  toast(`${filled} perguntas preenchidas a partir do banco.${extra}`, { label: 'Desfazer', run: popQuizUndo });
});

// ---------------------------------------------------------------------------
// Menu "Ficheiro"
// ---------------------------------------------------------------------------

document.querySelectorAll('details.menu').forEach(menu => {
  menu.addEventListener('click', e => { if (e.target.closest('.menu-pop button')) menu.open = false; });
});
document.addEventListener('click', e => {
  document.querySelectorAll('details.menu[open]').forEach(menu => { if (!menu.contains(e.target)) menu.open = false; });
});
