'use strict';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const FORMAT = 'quiznight-quiz';
const VERSION = 3;
const MAX_QUESTIONS = 100;   // no total, incluindo as perguntas especiais
const MAX_THEMES = 12;
const MAX_EXTRAS = 4;
const DEFAULT_PER_THEME = 6;
const DEFAULT_SPREAD = 5;    // não repetir o tema em 5 perguntas seguidas

// Temas com perguntas na base (podem ligar-se e desligar-se).
const CATALOG = [
  { id: 'historia',   name: 'História',                                  color: '#f37373' },
  { id: 'ciencias',   name: 'Ciências Exatas',                           color: '#75b4ff' },
  { id: 'desporto',   name: 'Desporto e Jogos',                          color: '#7ae6b4' },
  { id: 'musica',     name: 'Música, Cinema e TV',                       color: '#e949a4' },
  { id: 'arte',       name: 'Arte e Design',                             color: '#ffe46b' },
  { id: 'literatura', name: 'Literatura, Filosofia e Ciências Sociais',  color: '#8a2ce2' },
  { id: 'geografia',  name: 'Locais e Geografia',                        color: '#49d4c6' },
];
// Atualidade é um tema personalizado que vem ligado por omissão.
const ATUALIDADE = { id: 'atualidade', name: 'Atualidade', color: '#ff7919', custom: true };
const DEFAULT_THEMES = ['historia', 'ciencias', 'desporto', 'musica', 'arte', 'literatura', 'atualidade', 'geografia'];

// Cores para temas e perguntas extra criados pelo utilizador.
const CUSTOM_COLORS = ['#ff7919', '#ef5d8d', '#824dff', '#33ddff', '#f0be28', '#c33528', '#a1da3e', '#2c416d', '#f37373', '#49d4c6', '#e949a4', '#75b4ff'];

const APPROX = { id: 'approx', name: 'Aproximação', color: '#0ea2e7' };
const MADEIRA = { id: 'madeira', name: 'Madeira', color: '#24c278' };
const GUILHOTINA = { id: 'guilhotina', name: 'Guilhotina', color: '#a1da3e' };
const EXTRA_COLOR = '#2c416d';

// Cores de origem anteriores à paleta BoldKit: passam para as novas ao abrir o quiz.
// Uma cor escolhida à mão (que não esteja nesta lista) fica como está.
const OLD_COLORS = {
  '#b5562b': '#f37373', '#2f6db5': '#75b4ff', '#2e8b57': '#7ae6b4', '#8e44ad': '#e949a4',
  '#c08a00': '#ffe46b', '#8b5a2b': '#8a2ce2', '#16808a': '#49d4c6', '#c0392b': '#ff7919',
  '#5b5f97': '#0ea2e7', '#0f6e5a': '#24c278', '#b8336a': '#a1da3e', '#c46f1b': '#2c416d',
  '#d35400': '#ef5d8d', '#7d6608': '#824dff', '#1e8449': '#33ddff', '#117a65': '#f0be28',
  '#1f618d': '#c33528', '#6c3483': '#a1da3e', '#a93226': '#2c416d', '#b9770e': '#f37373',
  '#5d6d7e': '#49d4c6', '#943126': '#e949a4', '#0e6655': '#75b4ff',
};
function validColor(value, fallback) {
  const c = str(value).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(c) ? (OLD_COLORS[c] || c) : fallback;
}
const GUILHOTINA_WORDS = 4;
const GUILHOTINA_PROMPT = 'Que palavra liga estas quatro?';

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
    notes: '', source: '', difficulty: '', points: 1, verified: false, tags: [],
  };
}

function emptyApprox() {
  return { id: uid(), question: '', answer: '', unit: '', media: null, notes: '', source: '', verified: false, tags: [] };
}

function emptyGuilhotina() {
  return {
    id: uid(), type: 'guilhotina', question: '', words: Array(GUILHOTINA_WORDS).fill(''), answer: '',
    media: null, notes: '', source: '', difficulty: '', points: 1, verified: false, tags: [],
  };
}

function emptyForKind(kind) {
  if (kind === 'approx') return emptyApprox();
  if (kind === 'guilhotina') return emptyGuilhotina();
  return emptyQuestion();
}

function catalogTheme(id) {
  if (id === ATUALIDADE.id) return ATUALIDADE;
  return CATALOG.find(t => t.id === id) || null;
}

function newTheme(info, perTheme) {
  return { id: info.id, name: info.name, color: info.color, custom: !!info.custom, questions: Array.from({ length: perTheme }, emptyQuestion) };
}

function defaultSpecials() {
  return [
    { id: 'approx', kind: 'approx', name: APPROX.name, color: APPROX.color, enabled: true, position: 'start', numbered: false, reveal: true, q: emptyApprox() },
    { id: 'local', kind: 'question', name: MADEIRA.name, color: MADEIRA.color, enabled: true, position: 'start', numbered: true, q: emptyQuestion() },
    { id: 'guilhotina', kind: 'guilhotina', name: GUILHOTINA.name, color: GUILHOTINA.color, enabled: true, position: 'end', numbered: true, q: emptyGuilhotina() },
  ];
}

function newExtra(qz) {
  const n = qz.specials.filter(s => s.id.startsWith('extra')).length;
  return {
    id: `extra-${uid().slice(0, 8)}`, kind: 'question', name: n ? `Pergunta extra ${n + 1}` : 'Pergunta extra',
    color: EXTRA_COLOR, enabled: true, position: 'end', numbered: true, q: emptyQuestion(),
  };
}

function defaultConfig(themes) {
  return {
    spread: Math.min(DEFAULT_SPREAD, Math.max(2, themes.length)),
    checks: { missing: true, unverified: true, duplicates: true, reused: true, order: true },
    rules: themes.some(t => t.id === 'geografia') ? [{ id: uid().slice(0, 8), theme: 'geografia', tag: 'Porto', min: 1 }] : [],
  };
}

function defaultPresentation() {
  return { mode: 'themes', rounds: 4, answers: 'round', notes: true, order: [], template: DEFAULT_TEMPLATE };
}

function newQuiz(perTheme = DEFAULT_PER_THEME) {
  const themes = DEFAULT_THEMES.map(id => newTheme(catalogTheme(id), perTheme));
  return {
    format: FORMAT,
    version: VERSION,
    meta: { title: 'Quiz Night', date: todayISO(), venue: '' },
    perTheme,
    themes,
    parked: [],                         // temas desligados (guardam as perguntas)
    specials: defaultSpecials(),
    config: defaultConfig(themes),
    presentation: defaultPresentation(),
    updatedAt: new Date().toISOString(),
  };
}

// Categoria do banco de cada pergunta especial. A pergunta local chamada
// «Madeira» usa as perguntas da Madeira; outro nome começa uma categoria nova.
function specialBankId(sp) {
  if (sp.kind === 'approx') return APPROX.id;
  if (sp.kind === 'guilhotina') return GUILHOTINA.id;
  if (sp.id === 'local') return normText(sp.name) === 'madeira' ? MADEIRA.id : `local:${slugify(sp.name)}`;
  return `extra:${slugify(sp.name)}`;
}

function enabledSpecials(qz) { return qz.specials.filter(s => s.enabled); }
function specialsAt(qz, position) { return enabledSpecials(qz).filter(s => s.position === position); }
function themedTotal(qz) { return qz.themes.length * qz.perTheme; }
function quizTotal(qz) { return themedTotal(qz) + enabledSpecials(qz).length; }
function maxPerTheme(qz) { return Math.max(1, Math.floor((MAX_QUESTIONS - enabledSpecials(qz).length) / Math.max(1, qz.themes.length))); }

// ---------------------------------------------------------------------------
// Normalização (importação e migração das versões 1 e 2)
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
  if (m.placeholder) return placeholderMedia();
  const data = str(m.data).startsWith('data:') ? str(m.data) : '';
  const url = str(m.url);
  if (!data && !url) return null;
  return { kind: m.kind, name: str(m.name), mime: str(m.mime), data, url: data ? '' : url };
}

function normalizeTags(src) {
  const tags = Array.isArray(src.tags) ? src.tags.map(t => str(t).trim()).filter(Boolean) : [];
  if (src.porto && !tags.some(t => normText(t) === 'porto')) tags.push('Porto'); // versões anteriores
  return [...new Set(tags)];
}

// kind: 'approx', 'guilhotina' ou 'theme' (perguntas normais, incluindo a local e as extra).
function normalizeQuestion(src, kind = 'theme') {
  const q = emptyForKind(kind);
  if (!src || typeof src !== 'object') return q;
  if (src.id) q.id = str(src.id);
  for (const k of ['question', 'answer', 'notes', 'source']) q[k] = str(src[k]);
  q.verified = !!src.verified;
  q.tags = normalizeTags(src);
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
  return q;
}

function normalizeTheme(src, perTheme, notes) {
  const info = catalogTheme(str(src.id));
  const theme = {
    id: str(src.id) || `custom-${uid().slice(0, 8)}`,
    name: str(src.name) || (info ? info.name : 'Tema'),
    color: validColor(src.color, info ? info.color : CUSTOM_COLORS[0]),
    custom: info ? !!info.custom : true,
  };
  const qs = Array.isArray(src.questions) ? src.questions : [];
  if (notes && qs.length > perTheme && qs.slice(perTheme).some(q => q && (q.question || q.answer))) {
    notes.push(`"${theme.name}" tinha ${qs.length} perguntas; só as primeiras ${perTheme} foram importadas.`);
  }
  theme.questions = Array.from({ length: perTheme }, (_, j) => normalizeQuestion(qs[j]));
  return theme;
}

function normalizeSpecial(src) {
  const kind = ['approx', 'question', 'guilhotina'].includes(src.kind) ? src.kind : 'question';
  return {
    id: str(src.id) || `extra-${uid().slice(0, 8)}`,
    kind,
    name: str(src.name) || (kind === 'approx' ? APPROX.name : kind === 'guilhotina' ? GUILHOTINA.name : 'Pergunta extra'),
    color: validColor(src.color, EXTRA_COLOR),
    enabled: src.enabled !== false,
    position: src.position === 'end' ? 'end' : 'start',
    numbered: !!src.numbered,
    ...(kind === 'approx' ? { reveal: src.reveal !== false } : {}),
    q: normalizeQuestion(src.q, kind === 'question' ? 'theme' : kind),
  };
}

function normalizeConfig(c, themes) {
  const out = defaultConfig(themes);
  if (!c || typeof c !== 'object') return out;
  if (Number.isInteger(c.spread)) out.spread = c.spread;
  if (c.checks && typeof c.checks === 'object') {
    for (const k of Object.keys(out.checks)) if (typeof c.checks[k] === 'boolean') out.checks[k] = c.checks[k];
  }
  if (Array.isArray(c.rules)) {
    out.rules = c.rules.filter(r => r && typeof r === 'object').map(r => ({
      id: str(r.id) || uid().slice(0, 8), theme: str(r.theme), tag: str(r.tag).trim(), min: Math.max(1, Number(r.min) || 1),
    })).filter(r => r.tag);
  }
  return out;
}

function normalizePresentation(p, qz) {
  const out = defaultPresentation();
  if (!p || typeof p !== 'object') return out;
  if (['themes', 'mixed'].includes(p.mode)) out.mode = p.mode;
  if (Number.isInteger(p.rounds) && p.rounds >= 1) out.rounds = p.rounds;
  else if (Number.isInteger(p.roundSize) && p.roundSize >= 1) out.rounds = Math.ceil(themedTotal(qz) / p.roundSize); // v2
  if (['round', 'end', 'none'].includes(p.answers)) out.answers = p.answers;
  if (typeof p.notes === 'boolean') out.notes = p.notes;
  if (TEMPLATE_IDS.includes(p.template)) out.template = p.template;
  // v2 guardava a ordem por índice do tema ("3:2"); a v3 por id ("musica:2").
  const V2_ORDER = ['historia', 'ciencias', 'desporto', 'musica', 'arte', 'literatura', 'atualidade', 'geografia'];
  const order = Array.isArray(p.order) ? p.order.map(k => {
    const [t, q] = str(k).split(':');
    return /^\d+$/.test(t) ? `${V2_ORDER[Number(t)]}:${q}` : str(k);
  }) : [];
  if (isValidOrder(order, qz)) out.order = order;
  return out;
}

// Converte qualquer JSON razoável num quiz válido (campos em falta ficam vazios).
function normalizeQuiz(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('O ficheiro não contém um objeto JSON.');
  if (raw.format === 'quiznight-bank') throw new Error('Este ficheiro é um banco de perguntas — importa-o no Banco.');
  const notes = [];
  const v3 = Number(raw.version) >= 3;
  const quiz = newQuiz();

  if (raw.meta) Object.assign(quiz.meta, {
    title: str(raw.meta.title) || quiz.meta.title,
    date: str(raw.meta.date) || quiz.meta.date,
    venue: str(raw.meta.venue),
  });

  // Especiais: a v2 tinha três campos fixos.
  quiz.specials = v3 && Array.isArray(raw.specials)
    ? raw.specials.filter(s => s && typeof s === 'object').map(normalizeSpecial)
    : defaultSpecials().map(sp => ({
      ...sp,
      q: normalizeQuestion(sp.id === 'approx' ? raw.approximation : sp.id === 'local' ? raw.madeira : raw.guilhotina, sp.kind === 'question' ? 'theme' : sp.kind),
    }));

  // Temas: na v2 eram sempre os oito, pela ordem do catálogo.
  const srcThemes = (Array.isArray(raw.themes) ? raw.themes : []).filter(t => t && typeof t === 'object');
  const v2Themes = v3 ? srcThemes : DEFAULT_THEMES.map((id, i) => ({ ...(srcThemes.find(t => t.id === id) || srcThemes[i] || {}), id }));
  const count = Math.max(1, Math.min(MAX_THEMES, v2Themes.length || DEFAULT_THEMES.length));
  const longest = Math.max(0, ...v2Themes.map(t => (Array.isArray(t.questions) ? t.questions.length : 0)));
  const limit = Math.max(1, Math.floor((MAX_QUESTIONS - enabledSpecials(quiz).length) / count));
  const wanted = Number.isInteger(raw.perTheme) ? raw.perTheme : Math.max(DEFAULT_PER_THEME, longest);
  quiz.perTheme = Math.min(limit, Math.max(1, wanted));
  quiz.themes = (v2Themes.length ? v2Themes : DEFAULT_THEMES.map(catalogTheme)).slice(0, MAX_THEMES).map(t => normalizeTheme(t, quiz.perTheme, notes));
  if (v2Themes.length > MAX_THEMES) notes.push(`O ficheiro tinha ${v2Themes.length} temas; só ${MAX_THEMES} foram importados.`);
  quiz.parked = v3 && Array.isArray(raw.parked) ? raw.parked.filter(t => t && typeof t === 'object').map(t => normalizeTheme(t, Array.isArray(t.questions) ? t.questions.length : quiz.perTheme)) : [];

  quiz.config = normalizeConfig(raw.config, quiz.themes);
  quiz.presentation = normalizePresentation(raw.presentation, quiz);
  fixQuiz(quiz);
  return { quiz, notes };
}

// Depois de mudar temas, especiais ou tamanho: põe tudo dentro dos limites.
function fixQuiz(qz) {
  qz.perTheme = Math.min(maxPerTheme(qz), Math.max(1, qz.perTheme));
  qz.themes.forEach(theme => {
    theme.questions = Array.from({ length: qz.perTheme }, (_, i) => theme.questions[i] || emptyQuestion());
  });
  qz.config.spread = Math.min(Math.max(2, qz.themes.length), Math.max(2, qz.config.spread));
  qz.presentation.rounds = Math.min(themedTotal(qz), Math.max(1, qz.presentation.rounds));
  if (!isValidOrder(qz.presentation.order, qz)) qz.presentation.order = qz.presentation.mode === 'mixed' ? mixedOrder(qz) : [];
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

function hasTag(q, tag) { return (q.tags || []).some(t => normText(t) === normText(tag)); }

// ---------------------------------------------------------------------------
// Ordem de apresentação
// ---------------------------------------------------------------------------

// As chaves usam o id do tema, para a ordem sobreviver a mudanças nos temas.
function slotKey(themeId, q) { return `${themeId}:${q}`; }
function parseKey(key) { const i = key.lastIndexOf(':'); return { id: key.slice(0, i), q: Number(key.slice(i + 1)) }; }
function themeIndex(qz, id) { return qz.themes.findIndex(t => t.id === id); }

function themeOrder(qz) {
  const out = [];
  qz.themes.forEach(t => { for (let q = 0; q < qz.perTheme; q++) out.push(slotKey(t.id, q)); });
  return out;
}

function isValidOrder(order, qz) {
  if (!Array.isArray(order) || order.length !== themedTotal(qz)) return false;
  const all = new Set(themeOrder(qz));
  return new Set(order).size === order.length && order.every(k => all.has(k));
}

// Tamanho da janela sem repetições: 2 = nunca o mesmo tema em perguntas seguidas.
function spreadWindow(qz) { return qz.themes.length < 2 ? 1 : Math.min(qz.themes.length, Math.max(2, qz.config.spread)); }

// Ordem aleatória que respeita a janela sem repetições.
// Dentro de cada tema mantém-se a ordem da grelha (útil para graduar a dificuldade).
function mixedOrder(qz) {
  const ids = qz.themes.map(t => t.id);
  const n = ids.length;
  const per = qz.perTheme;
  const total = n * per;
  const window = spreadWindow(qz);
  for (let attempt = 0; attempt < 500; attempt++) {
    const left = Array(n).fill(per);
    const seq = [];
    while (seq.length < total) {
      const recent = new Set(seq.slice(-(window - 1)));
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
      return seq.map(t => slotKey(ids[t], next[t]++));
    }
  }
  // Recurso: a mesma permutação de temas repetida cumpre qualquer janela até n.
  const perm = shuffledIndices(n);
  return Array.from({ length: total }, (_, i) => slotKey(ids[perm[i % n]], Math.floor(i / n)));
}

// Posições (índices na ordem) cujo tema já apareceu nas perguntas anteriores da janela.
function orderConflicts(qz, order) {
  const window = spreadWindow(qz);
  const themes = order.map(k => parseKey(k).id);
  const out = new Set();
  themes.forEach((t, i) => {
    for (let j = Math.max(0, i - window + 1); j < i; j++) if (themes[j] === t) out.add(i);
  });
  return out;
}

function presentationOrder(quiz) {
  const p = quiz.presentation;
  if (p.mode !== 'mixed') return themeOrder(quiz);
  if (!isValidOrder(p.order, quiz)) p.order = mixedOrder(quiz);
  return p.order;
}

// Números: primeiro as especiais numeradas do início, depois as dos temas e por fim
// as especiais numeradas do fim. Devolve chaves de temas e ids de especiais.
function numberMap(quiz) {
  const map = new Map();
  let n = 1;
  specialsAt(quiz, 'start').forEach(sp => { if (sp.numbered) map.set(sp.id, n++); });
  presentationOrder(quiz).forEach(key => map.set(key, n++));
  specialsAt(quiz, 'end').forEach(sp => { if (sp.numbered) map.set(sp.id, n++); });
  return map;
}

function specialNumber(quiz, sp) { return numberMap(quiz).get(sp.id) || null; }

function rounds(quiz) {
  const numbers = numberMap(quiz);
  const items = presentationOrder(quiz).map(key => {
    const { id, q } = parseKey(key);
    const t = themeIndex(quiz, id);
    const theme = quiz.themes[t];
    return { key, t, n: numbers.get(key), q: theme.questions[q], themeName: theme.name, color: theme.color };
  });
  if (quiz.presentation.mode !== 'mixed') {
    return quiz.themes.map((theme, t) => ({
      title: `Ronda ${t + 1}`, subtitle: theme.name, color: theme.color,
      items: items.filter(it => it.t === t),
    }));
  }
  // Rondas o mais iguais possível: as primeiras ficam com mais uma, se não der certo.
  const count = Math.min(items.length, quiz.presentation.rounds);
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const out = [];
  let i = 0;
  for (let r = 0; r < count; r++) {
    const size = base + (r < extra ? 1 : 0);
    const slice = items.slice(i, i + size);
    i += size;
    out.push({ title: `Ronda ${r + 1}`, subtitle: `Perguntas ${slice[0].n}–${slice[slice.length - 1].n}`, color: MADEIRA.color, items: slice });
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

// Imagem por definir: reserva o espaço no slide, e o PowerPoint leva uma imagem
// provisória que se substitui depois (botão direito › Alterar Imagem).
function placeholderMedia() { return { kind: 'image', placeholder: true, name: '', mime: '', data: '', url: '' }; }

function mediaSrc(m) { return m ? (m.data || m.url) : ''; }

function mediaLabel(m) {
  if (!m) return '';
  if (m.placeholder) return 'Imagem por definir';
  return `${MEDIA_KINDS[m.kind]}:${m.name || m.url || 'ficheiro'}`;
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
