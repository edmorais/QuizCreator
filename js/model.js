'use strict';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const FORMAT = 'quiznight-quiz';
const VERSION = 2;
// Perguntas por tema: 2 a 12, ou seja, 16 a 96 perguntas temáticas (múltiplos de 8).
const DEFAULT_PER_THEME = 6;
const MIN_PER_THEME = 2;
const MAX_PER_THEME = 12;

const THEMES = [
  { id: 'historia',   name: 'História',                                  color: '#b5562b' },
  { id: 'ciencias',   name: 'Ciências Exatas',                           color: '#2f6db5' },
  { id: 'desporto',   name: 'Desporto e Jogos',                          color: '#2e8b57' },
  { id: 'musica',     name: 'Música, Cinema e TV',                       color: '#8e44ad' },
  { id: 'arte',       name: 'Arte e Design',                             color: '#c08a00' },
  { id: 'literatura', name: 'Literatura, Filosofia e Ciências Sociais',  color: '#8b5a2b' },
  { id: 'atualidade', name: 'Atualidade',                                color: '#c0392b' },
  { id: 'geografia',  name: 'Locais e Geografia',                        color: '#16808a' },
];
const APPROX = { id: 'approx', name: 'Aproximação', color: '#5b5f97' };
const MADEIRA = { id: 'madeira', name: 'Madeira', color: '#0f6e5a' };
const GUILHOTINA = { id: 'guilhotina', name: 'Guilhotina', color: '#b8336a' };
const GUILHOTINA_WORDS = 4;
const GUILHOTINA_PROMPT = 'Que palavra liga estas quatro?';

// A guilhotina é sempre a última: Madeira (1) + perguntas dos temas + 1.
function guilhotinaNumber(qz) { return 2 + THEMES.length * qz.perTheme; }

// Tipo de slot de cada tema do banco: a aproximação e a guilhotina têm formato próprio.
function kindOfTheme(themeId) {
  if (themeId === APPROX.id) return 'approx';
  if (themeId === GUILHOTINA.id) return 'guilhotina';
  return 'theme';
}

const DIFFICULTY = { '1': 'Fácil', '2': 'Média', '3': 'Difícil' };
const TYPES = { open: 'Resposta aberta', choice: 'Escolha múltipla', match: 'Correspondência' };
const MEDIA_KINDS = { image: 'Imagem', audio: 'Áudio', video: 'Vídeo' };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SIMILARITY_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function emptyQuestion() {
  return {
    id: uid(), type: 'open', question: '', answer: '',
    options: [], correct: -1,          // escolha múltipla
    pairs: [], matchOrder: [],         // correspondência: pares certos + ordem baralhada da coluna B
    media: null,                       // {kind, name, mime, data?, url?}
    notes: '', source: '', difficulty: '', points: 1, verified: false, porto: false,
  };
}

function emptyApprox() {
  return { id: uid(), question: '', answer: '', unit: '', media: null, notes: '', source: '', verified: false };
}

function emptyGuilhotina() {
  return {
    id: uid(), type: 'guilhotina', question: '', words: Array(GUILHOTINA_WORDS).fill(''), answer: '',
    media: null, notes: '', source: '', difficulty: '', points: 1, verified: false,
  };
}

function emptyForKind(kind) {
  if (kind === 'approx') return emptyApprox();
  if (kind === 'guilhotina') return emptyGuilhotina();
  return emptyQuestion();
}

function defaultPresentation() {
  return { mode: 'themes', roundSize: 12, answers: 'round', notes: true, order: [], template: DEFAULT_TEMPLATE };
}

function newQuiz(perTheme = DEFAULT_PER_THEME) {
  return {
    format: FORMAT,
    version: VERSION,
    meta: { title: 'Quiz Night', date: todayISO(), venue: '' },
    perTheme,
    approximation: emptyApprox(),
    madeira: emptyQuestion(),
    themes: THEMES.map(t => ({ id: t.id, name: t.name, questions: Array.from({ length: perTheme }, emptyQuestion) })),
    guilhotina: emptyGuilhotina(),
    presentation: defaultPresentation(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Normalização (importação e migração da v1)
// ---------------------------------------------------------------------------

const str = v => (v === undefined || v === null) ? '' : String(v);

function shuffledIndices(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPermutation(arr, n) {
  if (!Array.isArray(arr) || arr.length !== n) return false;
  const seen = new Set(arr);
  return seen.size === n && arr.every(i => Number.isInteger(i) && i >= 0 && i < n);
}

function normalizeMedia(m) {
  if (!m || typeof m !== 'object' || !MEDIA_KINDS[m.kind]) return null;
  const data = str(m.data).startsWith('data:') ? str(m.data) : '';
  const url = str(m.url);
  if (!data && !url) return null;
  return { kind: m.kind, name: str(m.name), mime: str(m.mime), data, url: data ? '' : url };
}

// kind: 'approx', 'guilhotina' ou 'theme' (perguntas normais, incluindo a da Madeira).
function normalizeQuestion(src, kind = 'theme') {
  const q = emptyForKind(kind);
  if (!src || typeof src !== 'object') return q;
  if (src.id) q.id = str(src.id);
  for (const k of ['question', 'answer', 'notes', 'source']) q[k] = str(src[k]);
  q.verified = !!src.verified;
  // v1 tinha só um URL de imagem
  q.media = normalizeMedia(src.media) || (src.image ? { kind: 'image', name: '', mime: '', data: '', url: str(src.image) } : null);
  if (kind === 'approx') {
    q.unit = str(src.unit);
    return q;
  }
  q.difficulty = DIFFICULTY[str(src.difficulty)] ? str(src.difficulty) : '';
  q.points = Number(src.points) === 2 ? 2 : 1;
  if (kind === 'guilhotina') {
    const words = Array.isArray(src.words) ? src.words : [];
    q.words = Array.from({ length: GUILHOTINA_WORDS }, (_, i) => str(words[i]));
    return q;
  }
  q.options = Array.isArray(src.options) ? src.options.map(str).filter(Boolean) : [];
  q.type = TYPES[src.type] ? src.type : (q.options.length ? 'choice' : 'open');
  q.correct = Number.isInteger(src.correct) && src.correct < q.options.length
    ? src.correct
    : q.options.findIndex(o => o.trim().toLowerCase() === q.answer.trim().toLowerCase());
  q.pairs = Array.isArray(src.pairs)
    ? src.pairs.filter(p => p && typeof p === 'object').map(p => ({ left: str(p.left), right: str(p.right) }))
    : [];
  q.matchOrder = isPermutation(src.matchOrder, q.pairs.length) ? src.matchOrder.slice() : shuffledIndices(q.pairs.length);
  q.porto = !!src.porto;
  return q;
}

function normalizePresentation(p, perTheme) {
  const out = defaultPresentation();
  if (!p || typeof p !== 'object') return out;
  if (['themes', 'mixed'].includes(p.mode)) out.mode = p.mode;
  if (Number.isInteger(p.roundSize) && p.roundSize >= 1 && p.roundSize <= THEMES.length * MAX_PER_THEME) out.roundSize = p.roundSize;
  if (['round', 'end', 'none'].includes(p.answers)) out.answers = p.answers;
  if (typeof p.notes === 'boolean') out.notes = p.notes;
  if (isValidOrder(p.order, perTheme)) out.order = p.order.slice();
  if (TEMPLATE_IDS.includes(p.template)) out.template = p.template;
  return out;
}

function clampPerTheme(n) { return Math.min(MAX_PER_THEME, Math.max(MIN_PER_THEME, n)); }

// Muda o tamanho do quiz: acrescenta células vazias ou corta as últimas de cada tema.
function resizeQuiz(qz, perTheme) {
  qz.themes.forEach(theme => {
    theme.questions = Array.from({ length: perTheme }, (_, i) => theme.questions[i] || emptyQuestion());
  });
  qz.perTheme = perTheme;
  qz.presentation.order = qz.presentation.mode === 'mixed' ? mixedOrder(perTheme) : [];
}

// Converte qualquer JSON razoável num quiz válido (campos em falta ficam vazios).
function normalizeQuiz(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('O ficheiro não contém um objeto JSON.');
  if (raw.format === 'quiznight-bank') throw new Error('Este ficheiro é um banco de perguntas — importa-o no Banco.');
  const notes = [];
  const srcThemes = Array.isArray(raw.themes) ? raw.themes : [];
  // Quizzes antigos não indicam o tamanho: deduz-se da maior coluna.
  const longest = Math.max(0, ...srcThemes.map(t => (t && Array.isArray(t.questions) ? t.questions.length : 0)));
  const perTheme = clampPerTheme(Number.isInteger(raw.perTheme) ? raw.perTheme : Math.max(DEFAULT_PER_THEME, longest));
  const quiz = newQuiz(perTheme);

  if (raw.meta) Object.assign(quiz.meta, {
    title: str(raw.meta.title) || quiz.meta.title,
    date: str(raw.meta.date) || quiz.meta.date,
    venue: str(raw.meta.venue),
  });
  quiz.approximation = normalizeQuestion(raw.approximation, 'approx');
  quiz.madeira = normalizeQuestion(raw.madeira);
  quiz.guilhotina = normalizeQuestion(raw.guilhotina, 'guilhotina');

  quiz.themes.forEach((theme, i) => {
    const src = srcThemes.find(t => t && t.id === theme.id) || srcThemes[i];
    if (!src) return;
    if (src.name) theme.name = str(src.name);
    const qs = Array.isArray(src.questions) ? src.questions : [];
    if (qs.length > perTheme) notes.push(`"${theme.name}" tinha ${qs.length} perguntas; só as primeiras ${perTheme} foram importadas.`);
    theme.questions = theme.questions.map((_, j) => normalizeQuestion(qs[j]));
  });
  if (srcThemes.length > THEMES.length) notes.push(`O ficheiro tinha ${srcThemes.length} temas; só ${THEMES.length} foram importados.`);

  quiz.presentation = normalizePresentation(raw.presentation, perTheme);
  return { quiz, notes };
}

// ---------------------------------------------------------------------------
// Respostas e estado de cada pergunta
// ---------------------------------------------------------------------------

// Número (1, 2, …) com que o item B aparece no ecrã.
function matchNumber(q, pairIndex) { return q.matchOrder.indexOf(pairIndex) + 1; }

function answerOf(q) {
  if (q.type === 'choice') {
    const opt = q.options[q.correct];
    return opt ? `${LETTERS[q.correct]}) ${opt}` : '';
  }
  if (q.type === 'match') {
    return q.pairs.map((_, i) => `${LETTERS[i]}-${matchNumber(q, i)}`).join(', ');
  }
  return `${str(q.answer).trim()}${q.unit && str(q.answer).trim() ? ' ' + q.unit : ''}`;
}

// Texto que identifica a pergunta (listas, pesquisas, deteção de repetidas).
// Na guilhotina são as quatro palavras: o enunciado é quase sempre o mesmo.
function questionText(q) {
  if (q.type === 'guilhotina') return (q.words || []).map(w => str(w).trim()).filter(Boolean).join(' · ');
  return q.question;
}

function isFilled(q) {
  if (q.type === 'guilhotina') return q.words.every(w => str(w).trim()) && str(q.answer).trim() !== '';
  if (!q.question.trim()) return false;
  if (q.type === 'choice') return q.options.length >= 2 && !!q.options[q.correct];
  if (q.type === 'match') return q.pairs.length >= 2 && q.pairs.every(p => p.left.trim() && p.right.trim());
  return str(q.answer).trim() !== '';
}

function isStarted(q) {
  return q.question.trim() !== '' || str(q.answer).trim() !== '' || (q.options || []).length > 0
    || (q.pairs || []).length > 0 || (q.words || []).some(w => str(w).trim()) || !!q.media;
}

// ---------------------------------------------------------------------------
// Ordem de apresentação
// ---------------------------------------------------------------------------

function slotKey(t, q) { return `${t}:${q}`; }
function parseKey(key) { const [t, q] = key.split(':').map(Number); return { t, q }; }

function themeOrder(perTheme) {
  const out = [];
  THEMES.forEach((_, t) => { for (let q = 0; q < perTheme; q++) out.push(slotKey(t, q)); });
  return out;
}

function isValidOrder(order, perTheme) {
  if (!Array.isArray(order) || order.length !== THEMES.length * perTheme) return false;
  const all = new Set(themeOrder(perTheme));
  return new Set(order).size === order.length && order.every(k => all.has(k));
}

// Em qualquer sequência de SPREAD_WINDOW perguntas seguidas não se repete o tema.
const SPREAD_WINDOW = 5;

// Ordem aleatória que respeita SPREAD_WINDOW.
// Dentro de cada tema mantém-se a ordem da grelha (útil para graduar a dificuldade).
function mixedOrder(perTheme) {
  const n = THEMES.length;
  const total = n * perTheme;
  for (let attempt = 0; attempt < 500; attempt++) {
    const left = Array(n).fill(perTheme);
    const seq = [];
    while (seq.length < total) {
      const recent = new Set(seq.slice(-(SPREAD_WINDOW - 1)));
      const allowed = left.map((_, t) => t).filter(t => left[t] > 0 && !recent.has(t));
      if (!allowed.length) break;
      // Dar mais peso aos temas com mais perguntas por colocar evita becos sem saída no fim.
      const weights = allowed.map(t => left[t] ** 3);
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      let pick = allowed[allowed.length - 1];
      for (let i = 0; i < allowed.length; i++) {
        r -= weights[i];
        if (r < 0) { pick = allowed[i]; break; }
      }
      seq.push(pick);
      left[pick]--;
    }
    if (seq.length === total) {
      const next = Array(n).fill(0);
      return seq.map(t => slotKey(t, next[t]++));
    }
  }
  // Recurso (nunca deve ser preciso): a mesma permutação de temas repetida cumpre a regra.
  const perm = shuffledIndices(n);
  return Array.from({ length: total }, (_, i) => slotKey(perm[i % n], Math.floor(i / n)));
}

// Posições (índices na ordem) cujo tema já apareceu nas SPREAD_WINDOW - 1 anteriores.
function orderConflicts(order) {
  const themes = order.map(k => parseKey(k).t);
  const out = new Set();
  themes.forEach((t, i) => {
    for (let j = Math.max(0, i - SPREAD_WINDOW + 1); j < i; j++) if (themes[j] === t) out.add(i);
  });
  return out;
}

function presentationOrder(quiz) {
  const p = quiz.presentation;
  if (p.mode !== 'mixed') return themeOrder(quiz.perTheme);
  if (!isValidOrder(p.order, quiz.perTheme)) p.order = mixedOrder(quiz.perTheme);
  return p.order;
}

// Madeira é a nº 1; as restantes seguem a ordem de apresentação (2..49).
function numberMap(quiz) {
  const map = new Map();
  presentationOrder(quiz).forEach((key, i) => map.set(key, i + 2));
  return map;
}

function rounds(quiz) {
  const order = presentationOrder(quiz);
  const item = key => {
    const { t, q } = parseKey(key);
    return { key, t, n: 0, q: quiz.themes[t].questions[q], themeName: quiz.themes[t].name, color: THEMES[t].color };
  };
  const items = order.map(item);
  items.forEach((it, i) => { it.n = i + 2; });
  if (quiz.presentation.mode !== 'mixed') {
    return THEMES.map((th, t) => ({
      title: `Ronda ${t + 1}`, subtitle: quiz.themes[t].name, color: th.color,
      items: items.filter(it => it.t === t),
    }));
  }
  const size = quiz.presentation.roundSize;
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push({ title: `Ronda ${out.length + 1}`, subtitle: `Perguntas ${items[i].n}–${items[Math.min(i + size, items.length) - 1].n}`, color: MADEIRA.color, items: items.slice(i, i + size) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Semelhança de texto (para detetar perguntas repetidas)
// ---------------------------------------------------------------------------

function normText(s) {
  return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s) { return new Set(normText(s).split(' ').filter(w => w.length > 2)); }

function similarityOf(tokA, tokB) {
  if (!tokA.size || !tokB.size) return 0;
  let inter = 0;
  tokA.forEach(w => { if (tokB.has(w)) inter++; });
  return inter / (tokA.size + tokB.size - inter);
}

// ---------------------------------------------------------------------------
// Multimédia
// ---------------------------------------------------------------------------

function youtubeId(url) {
  const m = str(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function mediaKindFromUrl(url) {
  if (youtubeId(url)) return 'video';
  const ext = (str(url).split(/[?#]/)[0].match(/\.(\w+)$/) || [])[1];
  if (!ext) return 'image';
  if (/^(mp3|wav|ogg|m4a|aac|flac)$/i.test(ext)) return 'audio';
  if (/^(mp4|webm|mov|m4v|avi)$/i.test(ext)) return 'video';
  return 'image';
}

function mediaKindFromMime(mime) {
  const k = str(mime).split('/')[0];
  return MEDIA_KINDS[k] ? k : null;
}

function mediaSrc(m) { return m ? (m.data || m.url) : ''; }

function mediaLabel(m) {
  if (!m) return '';
  return `${MEDIA_KINDS[m.kind]}: ${m.name || m.url || 'ficheiro'}`;
}

// ---------------------------------------------------------------------------
// Utilitários gerais
// ---------------------------------------------------------------------------

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

function slugify(s) {
  return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
