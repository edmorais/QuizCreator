'use strict';

// ---------------------------------------------------------------------------
// Estado e persistência
// ---------------------------------------------------------------------------

let quiz = newQuiz();
let current = null; // slot aberto no editor: {kind:'approx'} | {kind:'madeira'} | {kind:'guilhotina'} | {kind:'theme', t, q}
let numbers = new Map();
let saveTimer = null;

const LEGACY_STORAGE_KEY = 'quizcreator.current.v1';

async function init() {
  try {
    const saved = await kvGet('current');
    if (saved) {
      quiz = normalizeQuiz(saved).quiz;
      setSaveState('Recuperado do browser');
    } else {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        quiz = normalizeQuiz(JSON.parse(legacy)).quiz;
        save();
      }
    }
  } catch (e) {
    console.warn('Não foi possível ler o quiz guardado:', e);
    setSaveState('⚠ Armazenamento do browser indisponível — exporta o JSON regularmente');
  }
  await loadBank();
  await mergeBase();
  render();
}

function save() {
  quiz.updatedAt = new Date().toISOString();
  setSaveState('A guardar…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await kvSet('current', quiz);
      setSaveState('Guardado no browser · ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error(e);
      setSaveState('⚠ Não foi possível guardar no browser — exporta o JSON!');
    }
  }, 400);
}

function setSaveState(text) { $('#save-state').textContent = text; }

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function getSlot(ref) {
  if (ref.kind === 'approx') return quiz.approximation;
  if (ref.kind === 'madeira') return quiz.madeira;
  if (ref.kind === 'guilhotina') return quiz.guilhotina;
  return quiz.themes[ref.t].questions[ref.q];
}

function themeOfRef(ref) {
  if (ref.kind === 'approx') return APPROX;
  if (ref.kind === 'madeira') return MADEIRA;
  if (ref.kind === 'guilhotina') return GUILHOTINA;
  return { ...THEMES[ref.t], name: quiz.themes[ref.t].name };
}

function allRefs() {
  const refs = [{ kind: 'approx' }, { kind: 'madeira' }];
  quiz.themes.forEach((_, t) => { for (let q = 0; q < quiz.perTheme; q++) refs.push({ kind: 'theme', t, q }); });
  refs.push({ kind: 'guilhotina' });
  return refs;
}

// Tipo de slot para a normalização ('madeira' é uma pergunta normal).
function slotKind(ref) { return ref.kind === 'approx' || ref.kind === 'guilhotina' ? ref.kind : 'theme'; }

function sameRef(a, b) { return a.kind === b.kind && a.t === b.t && a.q === b.q; }

function refLabel(ref) {
  if (ref.kind === 'approx') return 'Pergunta de aproximação (lida no início, desempata no fim)';
  if (ref.kind === 'madeira') return 'Pergunta 1 · Madeira';
  if (ref.kind === 'guilhotina') return `Pergunta ${guilhotinaNumber(quiz)} · Guilhotina`;
  return `Pergunta ${numbers.get(slotKey(ref.t, ref.q))} · ${quiz.themes[ref.t].name} (${ref.q + 1}/${quiz.perTheme})`;
}

function baseFilename() { return `${slugify(quiz.meta.title)}-${quiz.meta.date || todayISO()}`; }

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

function render() {
  numbers = numberMap(quiz);
  renderMeta();
  renderSpecials();
  renderGrid();
  renderView();
  renderStatus();
  renderBankButton();
  renderUndoButton();
}

function renderMeta() {
  $('#quiz-size').value = String(THEMES.length * quiz.perTheme);
  if (document.activeElement !== $('#meta-title')) $('#meta-title').value = quiz.meta.title;
  if (document.activeElement !== $('#meta-date')) $('#meta-date').value = quiz.meta.date;
  if (document.activeElement !== $('#meta-venue')) $('#meta-venue').value = quiz.meta.venue;
}

function preview(q, emptyText) {
  const answer = answerOf(q);
  const text = questionText(q).trim();
  return [
    q.type === 'guilhotina' && text
      ? el('div', { class: 'q words' }, q.words.map(w => el('span', { class: 'word' }, w.trim() || '…')))
      : el('div', { class: 'q' }, text || emptyText),
    el('div', { class: 'a' }, answer ? '→ ' + answer : (text ? 'sem resposta' : '')),
  ];
}

const MEDIA_ICONS = { image: '🖼', audio: '🔊', video: '🎬' };

function badges(q) {
  const used = priorUses(q).length > 0;
  return [
    q.difficulty ? el('span', { class: 'dots', title: DIFFICULTY[q.difficulty] }, '●'.repeat(+q.difficulty)) : null,
    q.type === 'choice' ? el('span', { class: 'badge', title: TYPES.choice }, 'ABC') : null,
    q.type === 'match' ? el('span', { class: 'badge', title: TYPES.match }, 'A–1') : null,
    q.media ? el('span', { class: 'badge', title: mediaLabel(q.media) }, MEDIA_ICONS[q.media.kind]) : null,
    q.points === 2 ? el('span', { class: 'badge points' }, '2 pts') : null,
    q.porto ? el('span', { class: 'badge porto' }, 'Porto') : null,
    used ? el('span', { class: 'badge used', title: 'Já usada (ou parecida com uma usada) num quiz anterior' }, '↺') : null,
    q.verified ? el('span', { class: 'badge verified', title: 'Resposta verificada' }, '✓') : null,
  ];
}

function renderSpecials() {
  const fill = (node, ref, title, emptyText) => {
    const q = getSlot(ref);
    node.style.setProperty('--c', themeOfRef(ref).color);
    node.replaceChildren(el('h4', {}, title, ' ', badges(q)), ...preview(q, emptyText));
    node.onclick = () => openEditor(ref);
    node.onkeydown = e => { if (e.key === 'Enter') openEditor(ref); };
  };
  fill($('#card-approx'), { kind: 'approx' }, 'Aproximação · lida no início', 'Pergunta cuja resposta é um número…');
  fill($('#card-madeira'), { kind: 'madeira' }, 'Pergunta 1 · Madeira', 'Pergunta sobre a Madeira…');
  fill($('#card-guilhotina'), { kind: 'guilhotina' }, `Pergunta ${guilhotinaNumber(quiz)} · Guilhotina`, 'Quatro palavras e a palavra que as liga…');
}

function renderGrid() {
  const nodes = [];
  quiz.themes.forEach((theme, t) => {
    const filled = theme.questions.filter(isFilled).length;
    nodes.push(el('div', {
      class: 'theme-head', style: `--c:${THEMES[t].color}`, title: 'Duplo-clique para renomear',
      ondblclick: () => renameTheme(t),
    }, theme.name, el('small', {}, `${filled}/${quiz.perTheme}`)));
  });
  // A linha q contém a pergunta q de cada tema.
  for (let q = 0; q < quiz.perTheme; q++) quiz.themes.forEach((_, t) => nodes.push(cellNode(t, q)));
  $('#grid').replaceChildren(...nodes);
}

let gridDrag = null; // {t, q} da célula a ser arrastada

function cellNode(t, q) {
  const question = quiz.themes[t].questions[q];
  const state = isFilled(question) ? 'filled' : isStarted(question) ? 'partial' : 'empty';
  const ref = { kind: 'theme', t, q };
  const node = el('div', {
    class: `cell ${state}`, style: `--c:${THEMES[t].color}`, tabindex: '0', draggable: 'true',
    'data-t': String(t),
    onclick: () => openEditor(ref),
    onkeydown: e => { if (e.key === 'Enter') openEditor(ref); },
  },
    el('div', { class: 'num' }, el('span', { class: 'n' }, `${numbers.get(slotKey(t, q))}`), badges(question)),
    preview(question, 'vazia'),
  );
  // Arrastar troca a posição dentro do mesmo tema: a pergunta nunca muda de tema.
  node.addEventListener('dragstart', e => {
    gridDrag = { t, q };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-quiz-slot', `${t},${q}`);
    node.classList.add('dragging');
    $('#grid').classList.add('is-dragging');
    document.querySelectorAll('#grid .cell').forEach(c => c.classList.toggle('no-drop', Number(c.dataset.t) !== t));
  });
  node.addEventListener('dragend', () => {
    gridDrag = null;
    node.classList.remove('dragging');
    $('#grid').classList.remove('is-dragging');
    document.querySelectorAll('#grid .no-drop, #grid .drop-target').forEach(c => c.classList.remove('no-drop', 'drop-target'));
  });
  node.addEventListener('dragover', e => {
    if (!gridDrag || gridDrag.t !== t) return; // sem preventDefault: o browser mostra "proibido"
    e.preventDefault();
    node.classList.add('drop-target');
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-target'));
  node.addEventListener('drop', e => {
    if (!gridDrag || gridDrag.t !== t) return;
    e.preventDefault();
    e.stopPropagation();
    const from = gridDrag.q;
    if (from !== q) swap(t, from, q);
  });
  return node;
}

// Troca duas perguntas do mesmo tema.
function swap(t, q1, q2) {
  const a = quiz.themes[t].questions;
  [a[q1], a[q2]] = [a[q2], a[q1]];
  save();
  render();
}

function validate() {
  const warnings = [];
  const themeQs = quiz.themes.flatMap(t => t.questions);
  const all = [quiz.approximation, quiz.madeira, ...themeQs, quiz.guilhotina];
  const filled = all.filter(isFilled).length;
  const points = [quiz.madeira, ...themeQs, quiz.guilhotina].filter(isFilled).reduce((s, q) => s + q.points, 0);

  const ap = quiz.approximation;
  if (!isFilled(ap)) warnings.push('Falta a pergunta de aproximação');
  else if (Number.isNaN(Number(str(ap.answer).replace(',', '.').replace(/\s/g, '')))) warnings.push('A resposta da aproximação não é um número');

  if (!isFilled(quiz.madeira)) warnings.push('Falta a pergunta sobre a Madeira');
  if (!isFilled(quiz.guilhotina)) warnings.push(`Falta a guilhotina (${GUILHOTINA_WORDS} palavras e a resposta)`);

  quiz.themes.forEach(theme => {
    const missing = theme.questions.filter(q => !isFilled(q)).length;
    if (missing) warnings.push(`${theme.name}: faltam ${missing}`);
  });

  const noCorrect = all.filter(q => q.type === 'choice' && q.options.length && !q.options[q.correct]).length;
  if (noCorrect) warnings.push(`${noCorrect} de escolha múltipla sem opção correta`);

  const geo = quiz.themes.find(t => t.id === 'geografia');
  if (!geo.questions.some(q => q.porto)) {
    const hint = geo.questions.some(q => /porto/i.test(q.question)) ? ' (há uma que menciona “Porto” — marca-a)' : '';
    warnings.push('Locais e Geografia: nenhuma pergunta marcada como sobre o Porto' + hint);
  }

  if (quiz.presentation.mode === 'mixed') {
    const clashes = orderConflicts(presentationOrder(quiz)).size;
    if (clashes) warnings.push(`Ordem: ${clashText(clashes)}`);
  }

  const unverified = all.filter(q => isFilled(q) && !q.verified).length;
  if (unverified) warnings.push(`${unverified} respostas por verificar`);

  const reused = all.filter(q => questionText(q).trim() && priorUses(q).length).length;
  if (reused) warnings.push(`${reused} já usadas em quizzes anteriores (↺)`);

  const seen = new Map();
  all.forEach(q => {
    const key = normText(questionText(q));
    if (key) seen.set(key, (seen.get(key) || 0) + 1);
  });
  const dups = [...seen.values()].filter(n => n > 1).length;
  if (dups) warnings.push(`${dups} perguntas repetidas neste quiz`);

  return { warnings, filled, total: all.length, points };
}

function renderStatus() {
  const { warnings, filled, total, points } = validate();
  $('#progress-bar').style.width = `${(filled / total) * 100}%`;
  $('#progress-text').textContent = `${filled} de ${total} perguntas · ${points} pontos em jogo`;
  $('#progress-pct').textContent = `${Math.round((filled / total) * 100)}%`;
  const list = $('#warnings');
  if (warnings.length === 0) list.replaceChildren(el('li', { class: 'ok' }, '✓ Quiz completo e verificado'));
  else list.replaceChildren(...warnings.map(w => el('li', {}, w)));
}

function renameTheme(t) {
  const name = prompt('Nome do tema:', quiz.themes[t].name);
  if (name && name.trim()) {
    quiz.themes[t].name = name.trim();
    save();
    render();
  }
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const editor = $('#editor');
const F = {
  type: $('#ed-type'), points: $('#ed-points'), difficulty: $('#ed-difficulty'),
  question: $('#ed-question'), answer: $('#ed-answer'), unit: $('#ed-unit'),
  options: $('#ed-options'), correct: $('#ed-correct'),
  matchLeft: $('#ed-match-left'), matchRight: $('#ed-match-right'),
  notes: $('#ed-notes'), source: $('#ed-source'), verified: $('#ed-verified'), porto: $('#ed-porto'),
};

function openEditor(ref) {
  current = ref;
  const q = getSlot(ref);
  const isApprox = ref.kind === 'approx';
  const isGuil = ref.kind === 'guilhotina';
  const isGeo = ref.kind === 'theme' && quiz.themes[ref.t].id === 'geografia';

  editor.style.setProperty('--c', themeOfRef(ref).color);
  $('#ed-label').textContent = refLabel(ref);
  $('#ed-kind-row').hidden = isApprox;
  $('#ed-type-wrap').hidden = isGuil;
  $('#ed-unit-wrap').hidden = !isApprox;
  $('#ed-porto-wrap').hidden = !isGeo;
  $('#ed-move').style.visibility = ref.kind === 'theme' ? 'visible' : 'hidden';
  $('#ed-up').disabled = ref.kind !== 'theme' || ref.q === 0;
  $('#ed-down').disabled = ref.kind !== 'theme' || ref.q === quiz.perTheme - 1;
  F.answer.inputMode = isApprox ? 'decimal' : 'text';
  F.answer.placeholder = isApprox ? 'Número, ex. 1862' : '';
  F.question.placeholder = isApprox ? 'ex. Qual a altitude do Pico Ruivo, em metros?'
    : isGuil ? `Opcional — por omissão: “${GUILHOTINA_PROMPT}”` : '';
  $('#ed-question-label').firstChild.textContent = isGuil ? 'Enunciado ' : 'Pergunta ';
  document.querySelectorAll('.ed-word').forEach((input, i) => { input.value = (q.words || [])[i] || ''; });

  F.type.value = q.type || 'open';
  F.points.value = String(q.points || 1);
  F.difficulty.value = q.difficulty || '';
  F.question.value = q.question;
  F.answer.value = q.answer;
  F.unit.value = q.unit || '';
  F.options.value = (q.options || []).join('\n');
  F.matchLeft.value = (q.pairs || []).map(p => p.left).join('\n');
  F.matchRight.value = (q.pairs || []).map(p => p.right).join('\n');
  F.notes.value = q.notes;
  F.source.value = q.source;
  F.verified.checked = !!q.verified;
  F.porto.checked = !!q.porto;
  $('#ed-media-url').value = q.media && q.media.url ? q.media.url : '';

  syncEditorSections(q);
  onEditorOpened(ref);
  if (!editor.open) editor.showModal();
  F.question.focus();
}

// Mostra/esconde secções e atualiza as partes derivadas (opção correta, pré-visualizações).
function syncEditorSections(q) {
  const type = current.kind === 'approx' ? 'open' : q.type;
  $('#sec-guilhotina').hidden = type !== 'guilhotina';
  $('#sec-open').hidden = type !== 'open' && type !== 'guilhotina';
  $('#sec-choice').hidden = type !== 'choice';
  $('#sec-match').hidden = type !== 'match';

  if (type === 'choice') {
    const selected = q.correct;
    F.correct.replaceChildren(
      el('option', { value: '-1' }, '—'),
      ...q.options.map((o, i) => el('option', { value: String(i) }, `${LETTERS[i]}) ${o}`)),
    );
    F.correct.value = String(q.options[selected] ? selected : -1);
  }
  if (type === 'match') {
    $('#ed-match-preview').replaceChildren(
      el('div', {}, q.pairs.map((p, i) => el('div', {}, `${LETTERS[i]}. ${p.left || '…'}`))),
      el('div', {}, q.matchOrder.map((pi, k) => el('div', {}, `${k + 1}. ${(q.pairs[pi] || {}).right || '…'}`))),
      el('div', { class: 'match-answer' }, answerOf(q) ? 'Resposta: ' + answerOf(q) : ''),
    );
  }
  renderMediaPreview(q.media);
  renderDuplicateWarning(q);
}

function readEditor() {
  if (!current) return;
  const q = getSlot(current);
  q.question = F.question.value;
  q.answer = F.answer.value;
  q.notes = F.notes.value;
  q.source = F.source.value;
  q.verified = F.verified.checked;
  if (current.kind === 'approx') {
    q.unit = F.unit.value;
  } else if (current.kind === 'guilhotina') {
    q.points = Number(F.points.value);
    q.difficulty = F.difficulty.value;
    q.words = [...document.querySelectorAll('.ed-word')].map(i => i.value);
  } else {
    q.type = F.type.value;
    q.points = Number(F.points.value);
    q.difficulty = F.difficulty.value;
    q.porto = F.porto.checked;
    q.options = F.options.value.split('\n').map(s => s.trim()).filter(Boolean);
    q.correct = Number(F.correct.value);
    const left = F.matchLeft.value.split('\n');
    const right = F.matchRight.value.split('\n');
    const pairs = [];
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const p = { left: (left[i] || '').trim(), right: (right[i] || '').trim() };
      if (p.left || p.right) pairs.push(p);
    }
    if (pairs.length !== q.pairs.length) q.matchOrder = shuffledIndices(pairs.length);
    q.pairs = pairs;
  }
  syncEditorSections(q);
  save();
  render();
}

function renderDuplicateWarning(q) {
  const box = $('#ed-dup');
  const hits = questionText(q).trim() ? priorUses(q) : [];
  if (!hits.length) { box.hidden = true; return; }
  const { entry, uses } = hits[0];
  const last = uses[uses.length - 1];
  const same = entry.id === q.id || normText(questionText(entry.q)) === normText(questionText(q));
  box.hidden = false;
  box.replaceChildren(
    `⚠ ${same ? 'Esta pergunta já foi usada' : 'Parecida com uma pergunta já usada'} em “${last.title}” (${formatDate(last.date)})`,
    uses.length > 1 ? ` e mais ${uses.length - 1} vez(es)` : '',
    same ? '' : el('div', { class: 'dup-q' }, `«${questionText(entry.q)}» → ${answerOf(entry.q)}`),
  );
}

function renderMediaPreview(m) {
  const box = $('#ed-media-preview');
  $('#ed-media-kind-wrap').hidden = !m;
  $('#ed-media-remove').hidden = !m;
  if (!m) { box.replaceChildren(); return; }
  $('#ed-media-kind').value = m.kind;
  const src = mediaSrc(m);
  const yt = youtubeId(m.url);
  let node;
  if (yt) node = el('a', { href: m.url, target: '_blank', rel: 'noopener' }, el('img', { src: `https://img.youtube.com/vi/${yt}/mqdefault.jpg`, alt: 'Vídeo do YouTube' }));
  else if (m.kind === 'image') node = el('img', { src, alt: m.name || 'imagem' });
  else if (m.kind === 'audio') node = el('audio', { src, controls: '' });
  else node = el('video', { src, controls: '' });
  const size = m.data ? ` · ${(m.data.length * 0.75 / 1048576).toFixed(1)} MB` : '';
  box.replaceChildren(node, el('div', { class: 'media-name' }, mediaLabel(m) + size));
}

function step(delta) {
  const refs = allRefs();
  const i = refs.findIndex(r => sameRef(r, current));
  openEditor(refs[(i + delta + refs.length) % refs.length]);
}

function move(delta) {
  if (current.kind !== 'theme') return;
  const target = current.q + delta;
  if (target < 0 || target >= quiz.perTheme) return;
  swap(current.t, current.q, target);
  openEditor({ kind: 'theme', t: current.t, q: target });
}

Object.values(F).forEach(input => input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', readEditor));
document.querySelectorAll('.ed-word').forEach(input => input.addEventListener('input', readEditor));
$('#ed-prev').onclick = () => step(-1);
$('#ed-next').onclick = () => step(1);
$('#ed-close').onclick = () => editor.close();
$('#ed-up').onclick = () => move(-1);
$('#ed-down').onclick = () => move(1);
$('#ed-match-shuffle').onclick = () => {
  const q = getSlot(current);
  q.matchOrder = shuffledIndices(q.pairs.length);
  syncEditorSections(q);
  save();
  render();
};
$('#ed-clear').onclick = () => {
  replaceSlot(current, emptyForKind(slotKind(current)));
};
$('#ed-bank-search').onclick = () => { const ref = current; editor.close(); openBank(ref); };
$('#ed-bank-save').onclick = () => saveToBank(current);

// Multimédia
const MAX_MEDIA_MB = 40;
$('#ed-media-file-btn').onclick = () => $('#ed-media-file').click();
$('#ed-media-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !current) return;
  const mb = file.size / 1048576;
  if (mb > MAX_MEDIA_MB && !confirm(`O ficheiro tem ${mb.toFixed(0)} MB. Ficheiros grandes tornam o JSON e o PowerPoint pesados. Continuar?`)) return;
  const ref = current;
  const data = await readFileAsDataURL(file);
  getSlot(ref).media = { kind: mediaKindFromMime(file.type) || 'image', name: file.name, mime: file.type, data, url: '' };
  $('#ed-media-url').value = '';
  if (current && sameRef(current, ref)) syncEditorSections(getSlot(ref));
  save();
  render();
});
$('#ed-media-url').addEventListener('change', e => {
  const q = getSlot(current);
  const url = e.target.value.trim();
  if (url) q.media = { kind: mediaKindFromUrl(url), name: '', mime: '', data: '', url };
  else if (q.media && q.media.url) q.media = null;
  syncEditorSections(q);
  save();
  render();
});
$('#ed-media-kind').addEventListener('change', e => {
  const q = getSlot(current);
  if (q.media) q.media.kind = e.target.value;
  syncEditorSections(q);
  save();
  render();
});
$('#ed-media-remove').onclick = () => {
  const q = getSlot(current);
  q.media = null;
  $('#ed-media-url').value = '';
  syncEditorSections(q);
  save();
  render();
};

editor.addEventListener('keydown', e => {
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
});
editor.addEventListener('click', e => { if (e.target === editor) editor.close(); });
editor.addEventListener('close', () => { current = null; document.querySelectorAll('#editor audio, #editor video').forEach(m => m.pause()); });

// ---------------------------------------------------------------------------
// Metadados e ações da barra de topo
// ---------------------------------------------------------------------------

[['#meta-title', 'title'], ['#meta-date', 'date'], ['#meta-venue', 'venue']].forEach(([sel, key]) => {
  $(sel).addEventListener('input', e => { quiz.meta[key] = e.target.value; save(); renderStatus(); });
});

function hasContent() { return allRefs().some(r => isStarted(getSlot(r))); }

$('#btn-new').onclick = () => {
  if (hasContent() && !confirm('Começar um quiz novo? O atual será substituído (podes desfazer com Ctrl+Z).')) return;
  pushQuizUndo('novo quiz');
  const { perTheme, presentation: { template } } = quiz;
  quiz = newQuiz(perTheme);
  quiz.presentation.template = template;
  save();
  render();
};

$('#btn-export-json').onclick = () => {
  download(`${baseFilename()}.json`, JSON.stringify(quiz, null, 2), 'application/json');
};

$('#btn-import').onclick = () => $('#file-input').click();
$('#file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importQuizFile(file);
});

async function importQuizFile(file) {
  try {
    const { quiz: imported, notes } = normalizeQuiz(JSON.parse(await file.text()));
    if (hasContent() && !confirm(`Importar "${imported.meta.title}"? O quiz atual será substituído.`)) return;
    pushQuizUndo('importar quiz');
    quiz = imported;
    save();
    render();
    if (notes.length) alert('Importado com avisos:\n\n' + notes.join('\n'));
  } catch (err) {
    alert('Não foi possível importar o ficheiro:\n' + err.message);
  }
}

// Largar um .json na página também importa.
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!e.dataTransfer.files.length || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  importQuizFile(e.dataTransfer.files[0]);
});

init();
