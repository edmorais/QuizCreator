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

function renderView() {
  $('#grid-wrap').hidden = view !== 'themes';
  $('#order-view').hidden = view !== 'order';
  $('#view-themes').setAttribute('aria-pressed', String(view === 'themes'));
  $('#view-order').setAttribute('aria-pressed', String(view === 'order'));
  $('#view-hint').textContent = view === 'themes'
    ? 'Arrasta para trocar a posição dentro do tema · duplo-clique no tema para o renomear'
    : `Arrasta para mudar a ordem · em ${SPREAD_WINDOW} perguntas seguidas não se repete o tema`;
  if (view === 'order') renderOrderView();
}

$('#view-themes').onclick = () => setView('themes');
$('#view-order').onclick = () => setView('order');

let orderDrag = null; // índice na ordem a ser arrastado

function renderOrderView() {
  const p = quiz.presentation;
  const mixed = p.mode === 'mixed';
  const order = presentationOrder(quiz);
  const conflicts = mixed ? orderConflicts(order) : new Set();

  $('#ov-mode').value = p.mode;
  $('#ov-size').value = String(p.roundSize);
  $('#ov-size-wrap').hidden = !mixed;
  const status = $('#ov-status');
  status.className = 'ov-status ' + (!mixed ? '' : conflicts.size ? 'bad' : 'ok');
  status.textContent = !mixed
    ? 'Agrupada por tema: usa “Baralhar ordem” para misturar.'
    : conflicts.size
      ? `⚠ ${clashText(conflicts.size)}`
      : `✓ Nenhum tema se repete em ${SPREAD_WINDOW} perguntas seguidas`;

  const sections = rounds(quiz).map(r => el('section', { class: 'ov-round' },
    el('header', { class: 'ov-round-head' }, el('strong', {}, r.title), el('span', {}, r.subtitle)),
    el('div', { class: 'ov-list' }, r.items.map(it => orderCard(it, it.n - 2, conflicts.has(it.n - 2)))),
  ));
  $('#ov-rounds').replaceChildren(...sections);
}

function clashText(n) {
  return n === 1
    ? `1 pergunta repete o tema em ${SPREAD_WINDOW} seguidas`
    : `${n} perguntas repetem o tema em ${SPREAD_WINDOW} seguidas`;
}

function orderCard(it, index, clash) {
  const { t, q: qi } = parseKey(it.key);
  const ref = { kind: 'theme', t, q: qi };
  const q = it.q;
  const state = isFilled(q) ? 'filled' : isStarted(q) ? 'partial' : 'empty';
  const node = el('div', {
    class: `ov-card ${state}${clash ? ' clash' : ''}`, style: `--c:${it.color}`, tabindex: '0', draggable: 'true',
    title: clash ? `O tema “${it.themeName}” já apareceu nas ${SPREAD_WINDOW - 1} perguntas anteriores` : it.themeName,
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
    p.order = themeOrder(quiz.perTheme);
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
$('#ov-size').addEventListener('change', e => {
  quiz.presentation.roundSize = Number(e.target.value);
  save();
  render();
});

// ---------------------------------------------------------------------------
// Baralhar a ordem
// ---------------------------------------------------------------------------

function shuffleOrder() {
  pushQuizUndo('baralhar a ordem');
  quiz.presentation.mode = 'mixed';
  quiz.presentation.order = mixedOrder(quiz.perTheme);
  save();
  if (view !== 'order') setView('order');
  render();
  toast(`Ordem baralhada: nenhum tema se repete em ${SPREAD_WINDOW} perguntas seguidas.`, { label: 'Desfazer', run: popQuizUndo });
}

$('#btn-shuffle').onclick = shuffleOrder;

// ---------------------------------------------------------------------------
// Tamanho do quiz
// ---------------------------------------------------------------------------

$('#quiz-size').replaceChildren(...Array.from({ length: MAX_PER_THEME - MIN_PER_THEME + 1 }, (_, i) => {
  const total = THEMES.length * (MIN_PER_THEME + i);
  return el('option', { value: String(total) }, `${total} perguntas (${MIN_PER_THEME + i} por tema)`);
}));

$('#quiz-size').addEventListener('change', e => {
  const next = Number(e.target.value) / THEMES.length;
  const lost = quiz.themes.flatMap(t => t.questions.slice(next)).filter(isStarted).length;
  if (lost && !confirm(`Reduzir o quiz apaga ${lost} ${lost === 1 ? 'pergunta' : 'perguntas'} das últimas linhas da grelha. Continuar? (podes desfazer)`)) {
    e.target.value = String(THEMES.length * quiz.perTheme);
    return;
  }
  pushQuizUndo('mudar o tamanho do quiz');
  const mixed = quiz.presentation.mode === 'mixed';
  resizeQuiz(quiz, next);
  save();
  render();
  toast(`O quiz tem agora ${THEMES.length * next} perguntas temáticas.${mixed ? ' A ordem foi baralhada de novo.' : ''}`, { label: 'Desfazer', run: popQuizUndo });
});

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

  for (const [kind, info] of [['approx', APPROX], ['madeira', MADEIRA], ['guilhotina', GUILHOTINA]]) {
    const ref = { kind };
    if (!isTarget(ref)) continue;
    const e = take(info.id, [() => true]);
    if (e) { put(ref, e); filled++; } else missing.push(info.name);
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
    let portoNeeded = THEMES[t].id === 'geografia' && !staying.some(q => q.porto);
    const chosen = [];
    const maxMatch = fillMaxMatch(quiz.perTheme);
    for (const d of wanted) {
      const noMatch = e => matches < maxMatch || e.q.type !== 'match';
      const porto = e => !portoNeeded || e.q.porto;
      // Do mais exigente para o mais tolerante, se o banco não tiver o suficiente.
      const e = take(THEMES[t].id, [
        e => e.q.difficulty === d && noMatch(e) && porto(e),
        e => noMatch(e) && porto(e),
        e => noMatch(e),
        () => true,
      ]);
      if (!e) continue;
      if (e.q.type === 'match') matches++;
      if (e.q.porto) portoNeeded = false;
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
  $('#fill-rule-match').textContent = `No máximo ${count(maxMatch, 'correspondência', 'correspondências')} por tema e pelo menos 1 pergunta sobre o Porto`;
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
