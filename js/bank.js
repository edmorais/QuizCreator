'use strict';

// ---------------------------------------------------------------------------
// Banco de perguntas: todas as perguntas já usadas (com as datas) e as de reserva.
// Entrada: {id, theme, q, createdAt, updatedAt, uses: [{title, date}]}
// ---------------------------------------------------------------------------

const BANK_FORMAT = 'quiznight-bank';
const BANK_LIST_LIMIT = 300;

let bank = [];
let bankTokens = new Map(); // id → Set de palavras (para semelhança)
let bankNorm = new Map();   // id → texto normalizado (para igualdade)
let priorCache = new Map();
let bankTarget = null;      // slot a preencher quando o banco é aberto a partir do editor

const FIXED_CATEGORIES = [APPROX, MADEIRA, GUILHOTINA];

// Nome e cor de uma categoria do banco: tema do quiz, especial, catálogo ou o que ficou guardado na entrada.
function themeInfo(id, entry) {
  const theme = [...quiz.themes, ...quiz.parked].find(t => t.id === id);
  if (theme) return theme;
  const sp = quiz.specials.find(s => specialBankId(s) === id);
  if (sp) return { id, name: sp.name, color: sp.color };
  const known = FIXED_CATEGORIES.find(s => s.id === id) || catalogTheme(id);
  if (known) return known;
  const stored = entry || bank.find(e => e.theme === id && e.themeName);
  return { id, name: stored && stored.themeName ? stored.themeName : id.replace(/^(local|extra):/, ''), color: stored && stored.themeColor ? stored.themeColor : '#6b7280' };
}

function themeIdOfRef(ref) {
  if (ref.kind === 'special') return specialBankId(specialById(ref.id));
  return quiz.themes[ref.t].id;
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object' || !e.q) return null;
  const theme = str(e.theme) || CATALOG[0].id;
  const q = normalizeQuestion(e.q, kindOfTheme(theme));
  const id = str(e.id) || q.id;
  q.id = id;
  const uses = Array.isArray(e.uses)
    ? e.uses.filter(u => u && typeof u === 'object').map(u => ({ title: str(u.title), date: str(u.date) }))
    : [];
  const now = new Date().toISOString();
  return {
    id, theme, themeName: str(e.themeName), themeColor: str(e.themeColor), q, origin: str(e.origin),
    createdAt: str(e.createdAt) || now, updatedAt: str(e.updatedAt) || now, uses,
  };
}

// Junta ao banco as perguntas da base incluída (banco/base.js) que ainda lá não estão.
// Perguntas já existentes (talvez editadas ou usadas) nunca são substituídas.
async function mergeBase() {
  const base = window.QUIZ_BASE;
  if (!base || !Array.isArray(base.entries)) return;
  let seenVersion = null;
  try { seenVersion = await kvGet('baseVersion'); } catch (e) { return; }
  if (seenVersion === base.version) return;

  const known = new Set(bank.map(e => e.id));
  const added = base.entries.filter(e => !known.has(e.id)).map(normalizeEntry).filter(Boolean);
  // Perguntas que saíram da base (substituídas ou corrigidas) e que ainda não foram usadas nem editadas.
  const inBase = new Set(base.entries.map(e => e.id));
  const removed = bank.filter(e => e.origin === 'base' && !e.uses.length && !inBase.has(e.id));
  const removedIds = new Set(removed.map(e => e.id));
  bank = bank.filter(e => !removedIds.has(e.id)).concat(added);
  try {
    if (added.length) await bankPutMany(added);
    for (const e of removed) await bankDeleteOne(e.id);
    await kvSet('baseVersion', base.version);
  } catch (e) {
    console.error('Não foi possível gravar a base no banco:', e);
    return;
  }
  reindexBank();
  if (added.length || removed.length) setSaveState(`Base atualizada: ${added.length} perguntas novas, ${removed.length} retiradas`);
}

async function loadBank() {
  try {
    bank = (await bankGetAll()).map(normalizeEntry).filter(Boolean);
  } catch (e) {
    console.warn('Não foi possível ler o banco:', e);
    bank = [];
  }
  reindexBank();
}

function reindexBank() {
  bankTokens = new Map(bank.map(e => [e.id, tokens(questionText(e.q))]));
  bankNorm = new Map(bank.map(e => [e.id, normText(questionText(e.q))]));
  priorCache.clear();
}

// Usos anteriores (noutros quizzes) desta pergunta ou de perguntas parecidas.
function priorUses(q) {
  const text = questionText(q);
  if (!text.trim()) return [];
  const cacheKey = [q.id, text, quiz.meta.title, quiz.meta.date].join('\u0000');
  if (priorCache.has(cacheKey)) return priorCache.get(cacheKey);
  if (priorCache.size > 5000) priorCache.clear();

  const isCurrent = u => u.title === quiz.meta.title && u.date === quiz.meta.date;
  const norm = normText(text);
  const tok = tokens(text);
  const hits = [];
  for (const e of bank) {
    const uses = e.uses.filter(u => !isCurrent(u));
    if (!uses.length) continue;
    const score = (e.id === q.id || bankNorm.get(e.id) === norm) ? 1 : similarityOf(tok, bankTokens.get(e.id));
    if (score >= SIMILARITY_THRESHOLD) hits.push({ entry: e, uses, score });
  }
  hits.sort((a, b) => b.score - a.score);
  priorCache.set(cacheKey, hits);
  return hits;
}

function upsertEntry(themeId, q, use, now) {
  const norm = normText(questionText(q));
  let e = bank.find(x => x.id === q.id) || (norm && bank.find(x => bankNorm.get(x.id) === norm));
  if (!e) {
    e = { id: q.id, theme: themeId, q: null, createdAt: now, updatedAt: now, uses: [] };
    bank.push(e);
  }
  e.q = structuredClone({ ...q, id: e.id });
  e.theme = themeId;
  // Guarda o nome e a cor, para a categoria se reconhecer noutros quizzes.
  const info = themeInfo(themeId);
  e.themeName = info.name;
  e.themeColor = info.color;
  if (e.origin === 'base') e.origin = 'editada'; // já não é removida se sair da base
  e.updatedAt = now;
  if (use && !e.uses.some(u => u.title === use.title && u.date === use.date)) e.uses.push(use);
  bankNorm.set(e.id, norm);
  return e;
}

function quizSlots(qz) {
  return [
    ...enabledSpecials(qz).map(sp => ({ themeId: specialBankId(sp), q: sp.q })),
    ...qz.themes.flatMap(t => t.questions.map(q => ({ themeId: t.id, q }))),
  ];
}

async function persistBank(entries) {
  try {
    await bankPutMany(entries);
  } catch (e) {
    console.error(e);
    alert('Não foi possível gravar o banco no browser. Exporta-o para não perderes dados.');
  }
  reindexBank();
  render();
  if ($('#bank').open) renderBank();
}

// Marca todas as perguntas preenchidas do quiz como usadas na data do quiz.
async function archiveQuiz(qz) {
  const now = new Date().toISOString();
  const use = { title: qz.meta.title, date: qz.meta.date };
  const changed = quizSlots(qz).filter(s => isFilled(s.q)).map(s => upsertEntry(s.themeId, s.q, use, now));
  await persistBank(changed);
  return changed.length;
}

async function saveToBank(ref) {
  const q = getSlot(ref);
  if (!questionText(q).trim()) { alert('Escreve a pergunta antes de a guardar no banco.'); return; }
  await persistBank([upsertEntry(themeIdOfRef(ref), q, null, new Date().toISOString())]);
  setSaveState('Pergunta guardada no banco');
}

function useEntry(entry) {
  let ref = bankTarget;
  if (!ref) {
    const sp = enabledSpecials(quiz).find(s => specialBankId(s) === entry.theme);
    const t = quiz.themes.findIndex(th => th.id === entry.theme);
    if (sp) ref = { kind: 'special', id: sp.id };
    else if (t >= 0) {
      const q = quiz.themes[t].questions.findIndex(x => !isStarted(x));
      if (q < 0) { alert(`Não há células vazias em “${quiz.themes[t].name}”. Abre uma pergunta e usa “Procurar no banco” para a substituir.`); return; }
      ref = { kind: 'theme', t, q };
    } else {
      alert(`“${themeInfo(entry.theme, entry).name}” não faz parte deste quiz. Abre uma pergunta e usa “Procurar no banco” para a pôr noutro lugar.`);
      return;
    }
  }
  // A aproximação e a guilhotina têm formato próprio: só podem ir para o seu lugar.
  if (slotKind(ref) !== kindOfTheme(entry.theme)) {
    const name = themeInfo(slotKind(ref) === 'theme' ? entry.theme : themeIdOfRef(ref)).name.toLowerCase();
    alert(`Perguntas de ${name} só podem ir para o lugar da ${name} (e vice-versa).`);
    return;
  }
  if (allRefs().some(r => !sameRef(r, ref) && getSlot(r).id === entry.id) && !confirm('Esta pergunta já está neste quiz. Usar outra vez?')) return;
  if (isStarted(getSlot(ref)) && !confirm(`Substituir a ${refLabel(ref).toLowerCase()}?`)) return;

  $('#bank').close();
  replaceSlot(ref, entryCopy(entry));
}

function entryCopy(entry) {
  const copy = normalizeQuestion(structuredClone(entry.q), kindOfTheme(entry.theme));
  copy.id = entry.id;
  return copy;
}

// ---------------------------------------------------------------------------
// Substituir uma pergunta com possibilidade de desfazer
// ---------------------------------------------------------------------------

const undoStack = []; // [{ref, before}]

function replaceSlot(ref, content) {
  const slot = getSlot(ref);
  undoStack.push({ ref, before: structuredClone(slot) });
  if (undoStack.length > 100) undoStack.shift();
  for (const k of Object.keys(slot)) delete slot[k];
  Object.assign(slot, content);
  save();
  render();
  openEditor(ref);
}

function undoFor(ref) {
  for (let i = undoStack.length - 1; i >= 0; i--) if (sameRef(undoStack[i].ref, ref)) return i;
  return -1;
}

function undoReplace() {
  const i = undoFor(current);
  if (i < 0) return;
  const [{ ref, before }] = undoStack.splice(i, 1);
  const slot = getSlot(ref);
  for (const k of Object.keys(slot)) delete slot[k];
  Object.assign(slot, before);
  save();
  render();
  openEditor(ref);
}

// ---------------------------------------------------------------------------
// Pergunta aleatória (no editor)
// ---------------------------------------------------------------------------

let randomPick = null;
let randomSkipped = new Set();

function randomCandidates(ref) {
  const theme = themeIdOfRef(ref);
  const diff = slotKind(ref) === 'approx' ? '' : $('#ed-random-diff').value;
  const inQuiz = new Set(allRefs().map(r => getSlot(r).id));
  return bank.filter(e => e.theme === theme && e.uses.length === 0 && !inQuiz.has(e.id)
    && (!diff || e.q.difficulty === diff));
}

// Chamado sempre que o editor abre (ou muda de pergunta).
function onEditorOpened(ref) {
  randomPick = null;
  randomSkipped = new Set();
  $('#ed-random-preview').hidden = true;
  $('#ed-random-diff').hidden = slotKind(ref) === 'approx';
  $('#ed-undo').hidden = undoFor(ref) < 0;
  updateRandomCount();
}

function updateRandomCount() {
  if (!current) return;
  const n = randomCandidates(current).length;
  $('#ed-random-count').textContent = `${n} por usar no banco`;
  $('#ed-random').disabled = n === 0;
}

function showRandom() {
  const candidates = randomCandidates(current);
  if (randomPick) randomSkipped.add(randomPick.id);
  let pool = candidates.filter(e => !randomSkipped.has(e.id));
  if (!pool.length) {
    // Já se viram todas: recomeça, mas sem repetir a que está à vista.
    randomSkipped = new Set();
    pool = candidates.filter(e => !randomPick || e.id !== randomPick.id);
  }
  randomPick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  renderRandomPreview();
}

function renderRandomPreview() {
  const box = $('#ed-random-preview');
  box.hidden = false;
  if (!randomPick) {
    box.replaceChildren(el('div', {}, 'Não há perguntas por usar deste tema no banco (com estes filtros).'));
    return;
  }
  const q = randomPick.q;
  const typeLine = q.type === 'choice'
    ? el('div', { class: 'rp-list' }, q.options.map((o, i) => `${LETTERS[i]}) ${o}`).join('   '))
    : q.type === 'match'
      ? el('div', { class: 'rp-list' }, q.pairs.map((p, i) => `${LETTERS[i]}. ${p.left} → ${p.right}`).join('   ·   '))
      : null;
  box.replaceChildren(...[
    el('div', { class: 'rp-head' },
      el('span', {}, 'Pré-visualização'),
      TYPES[q.type] ? el('span', { class: 'badge' }, TYPES[q.type]) : null,
      q.difficulty ? el('span', { class: 'badge' }, DIFFICULTY[q.difficulty]) : null,
      el('span', { class: 'badge' }, randomPick.origin === 'base' ? 'base incluída' : 'reserva'),
      q.verified ? null : el('span', { class: 'badge used' }, 'por verificar'),
    ),
    q.type === 'guilhotina'
      ? el('div', { class: 'rp-q q words' }, q.words.map(w => el('span', { class: 'word' }, w)))
      : el('div', { class: 'rp-q' }, q.question),
    typeLine,
    el('div', { class: 'rp-a' }, '→ ' + (answerOf(q) || '?')),
    q.notes ? el('div', { class: 'rp-notes' }, q.notes) : null,
    el('div', { class: 'rp-actions' },
      el('button', { type: 'button', class: 'primary', onclick: useRandom }, 'Usar esta'),
      el('button', { type: 'button', onclick: showRandom }, '🎲 Outra'),
      el('button', { type: 'button', onclick: () => { randomPick = null; box.hidden = true; } }, 'Fechar'),
    ),
  ].filter(Boolean));
}

function useRandom() {
  if (!randomPick || !current) return;
  replaceSlot(current, entryCopy(randomPick));
}

$('#ed-random').onclick = showRandom;
$('#ed-random-diff').addEventListener('change', () => {
  updateRandomCount();
  if (!$('#ed-random-preview').hidden) { randomPick = null; showRandom(); }
});
$('#ed-undo').onclick = undoReplace;

async function deleteEntry(entry) {
  if (!confirm(`Apagar do banco a pergunta «${questionText(entry.q).slice(0, 80)}»?\nO histórico de utilização desta pergunta perde-se.`)) return;
  try {
    await bankDeleteOne(entry.id);
    bank = bank.filter(e => e.id !== entry.id);
    reindexBank();
    render();
    renderBank();
  } catch (e) {
    alert('Não foi possível apagar: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// UI do banco
// ---------------------------------------------------------------------------

function openBank(target = null) {
  bankTarget = target;
  renderBankThemes();
  const box = $('#bank-target');
  box.hidden = !target;
  if (target) {
    box.textContent = `A escolher para: ${refLabel(target)}`;
    $('#bank-theme').value = themeIdOfRef(target);
  }
  renderBank();
  $('#bank').showModal();
  $('#bank-search').focus();
}

function renderBankButton() { $('#btn-bank').textContent = `Banco (${bank.length})`; }

function renderBank() {
  const query = normText($('#bank-search').value);
  const theme = $('#bank-theme').value;
  const status = $('#bank-status').value;
  const inQuiz = new Set(allRefs().map(r => getSlot(r).id));

  const matches = bank
    .filter(e => !theme || e.theme === theme)
    .filter(e => status !== 'unused' || e.uses.length === 0)
    .filter(e => status !== 'used' || e.uses.length > 0)
    .filter(e => !query || normText(`${questionText(e.q)} ${answerOf(e.q)} ${e.q.notes}`).includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  $('#bank-count').textContent = `${matches.length} de ${bank.length}`;
  const items = matches.slice(0, BANK_LIST_LIMIT).map(e => {
    const info = themeInfo(e.theme, e);
    const last = e.uses[e.uses.length - 1];
    const usage = e.uses.length
      ? `usada ${e.uses.length}× · última: ${last.title} (${formatDate(last.date)})`
      : `por usar (${e.origin === 'base' ? 'base incluída' : 'reserva'})`;
    return el('li', { class: 'bank-item', style: `--c:${info.color}` },
      el('div', { class: 'bi-head' },
        el('span', { class: 'chip' }, info.name),
        badges(e.q).filter(b => b && !b.classList.contains('used')),
        inQuiz.has(e.id) ? el('span', { class: 'badge porto' }, 'neste quiz') : null,
        el('span', { class: 'bi-usage' + (e.uses.length ? ' used' : '') }, usage),
      ),
      el('div', { class: 'bi-q' }, questionText(e.q)),
      el('div', { class: 'bi-a' }, '→ ' + (answerOf(e.q) || '?')),
      el('div', { class: 'bi-actions' },
        el('button', { type: 'button', class: 'primary', onclick: () => useEntry(e) }, bankTarget ? 'Usar aqui' : 'Usar'),
        el('button', { type: 'button', class: 'danger', onclick: () => deleteEntry(e) }, 'Apagar'),
      ),
    );
  });
  if (matches.length > BANK_LIST_LIMIT) items.push(el('li', { class: 'bi-more' }, `… e mais ${matches.length - BANK_LIST_LIMIT}. Refina a pesquisa.`));
  if (!bank.length) items.push(el('li', { class: 'bi-more' }, 'O banco está vazio. Arquiva o quiz atual ou importa quizzes antigos para começar.'));
  $('#bank-list').replaceChildren(...items);
}

// Filtro de temas: os do quiz e as especiais primeiro, depois as outras categorias que o banco tenha.
function renderBankThemes() {
  const select = $('#bank-theme');
  const value = select.value;
  const ids = [
    ...enabledSpecials(quiz).map(specialBankId),
    ...quiz.themes.map(t => t.id),
    ...[...new Set(bank.map(e => e.theme))].sort(),
  ];
  select.replaceChildren(
    el('option', { value: '' }, 'Todos os temas'),
    ...[...new Set(ids)].map(id => el('option', { value: id }, themeInfo(id).name)),
  );
  select.value = ids.includes(value) ? value : '';
}
['#bank-search', '#bank-theme', '#bank-status'].forEach(sel => $(sel).addEventListener('input', renderBank));
$('#btn-bank').onclick = () => openBank(null);
$('#bank-close').onclick = () => $('#bank').close();
$('#bank').addEventListener('click', e => { if (e.target === $('#bank')) $('#bank').close(); });
$('#bank').addEventListener('close', () => { bankTarget = null; });

$('#bank-archive').onclick = async () => {
  const n = quizSlots(quiz).filter(s => isFilled(s.q)).length;
  if (!n) { alert('O quiz não tem perguntas completas para arquivar.'); return; }
  if (!confirm(`Marcar as ${n} perguntas completas como usadas em “${quiz.meta.title}” (${formatDate(quiz.meta.date)})?\n\nFaz isto depois da quiz night. Se mudares depois a pergunta, arquiva outra vez para atualizar.`)) return;
  await archiveQuiz(quiz);
  alert(`${n} perguntas arquivadas no banco.`);
};

$('#bank-import-quizzes').onclick = () => $('#bank-quiz-files').click();
$('#bank-quiz-files').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  let total = 0;
  const errors = [];
  for (const file of files) {
    try {
      total += await archiveQuiz(normalizeQuiz(JSON.parse(await file.text())).quiz);
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }
  alert(`${total} perguntas de ${files.length - errors.length} quiz(zes) registadas como usadas.` + (errors.length ? '\n\nErros:\n' + errors.join('\n') : ''));
});

$('#bank-export').onclick = () => {
  const payload = { format: BANK_FORMAT, version: 1, exportedAt: new Date().toISOString(), entries: bank };
  download(`banco-de-perguntas-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
};

$('#bank-import').onclick = () => $('#bank-file').click();
$('#bank-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (raw.format !== BANK_FORMAT || !Array.isArray(raw.entries)) throw new Error('Não é um ficheiro de banco de perguntas.');
    const changed = [];
    for (const incoming of raw.entries.map(normalizeEntry).filter(Boolean)) {
      const existing = bank.find(x => x.id === incoming.id);
      if (!existing) { bank.push(incoming); changed.push(incoming); continue; }
      incoming.uses.forEach(u => { if (!existing.uses.some(x => x.title === u.title && x.date === u.date)) existing.uses.push(u); });
      if (incoming.updatedAt > existing.updatedAt) Object.assign(existing, { q: incoming.q, theme: incoming.theme, updatedAt: incoming.updatedAt });
      changed.push(existing);
    }
    await persistBank(changed);
    alert(`${changed.length} perguntas importadas/atualizadas no banco.`);
  } catch (err) {
    alert('Não foi possível importar o banco:\n' + err.message);
  }
});
