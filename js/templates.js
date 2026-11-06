'use strict';

// ---------------------------------------------------------------------------
// Templates de PowerPoint
//
// Coordenadas e tamanhos em px num quadro de 1280×720 (1 px = 1/96 pol.).
// Cada template define as cores, as fontes, os fundos (desenhados em canvas e
// guardados em slide masters) e como desenha as peças de cada slide.
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATE = 'atlantico';
const SLIDE_W = 1280;
const SLIDE_H = 720;
const ART_SCALE = 1.5;

const ANSWER_GREEN = '#4ade80'; // destaque das respostas, legível em todos os fundos

const hex = c => c.replace('#', '').toUpperCase();

// Clareia as cores dos temas para se lerem bem sobre fundos escuros.
function bright(color, amount = 0.38) {
  const n = parseInt(color.slice(1), 16);
  const mix = v => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

// ---------------------------------------------------------------------------
// Medir texto (para escolher o tamanho de letra)
// ---------------------------------------------------------------------------

const measureCtx = document.createElement('canvas').getContext('2d');
const SAFETY = 0.95; // o PowerPoint nem sempre parte as linhas como o browser

function textWidth(text, style, size) {
  const family = style.font.replace(/ (SemiBold|Semibold|Condensed)/g, '');
  measureCtx.font = `${style.italic ? 'italic ' : ''}${style.bold ? '700 ' : ''}${size}px "${family}", sans-serif`;
  const shown = style.upper ? text.toLocaleUpperCase('pt-PT') : text;
  return measureCtx.measureText(shown).width * (/Condensed/.test(style.font) ? 0.8 : 1)
    + (style.spacing || 0) * shown.length;
}

function lineCount(text, style, size, width) {
  const limit = width * SAFETY;
  const space = textWidth(' ', style, size);
  let lines = 1;
  let cur = 0;
  for (const word of String(text).split(/\s+/)) {
    const w = textWidth(word, style, size);
    if (cur && cur + space + w > limit) { lines++; cur = 0; }
    cur += (cur ? space : 0) + w;
    if (cur > limit) { lines += Math.floor(cur / limit); cur %= limit; }
  }
  return lines;
}

function fitSize(text, style, w, h, max, min = 20) {
  for (let s = max; s >= min; s -= 2) {
    if (lineCount(text, style, s, w) * s * 1.22 <= h) return s;
  }
  return min;
}

// ---------------------------------------------------------------------------
// Pintor: escreve e desenha num slide, em px
// ---------------------------------------------------------------------------

class Painter {
  constructor(pptx, slide, T) {
    this.pptx = pptx;
    this.s = slide;
    this.T = T;
  }

  text(t, [x, y, w, h], o = {}) {
    const str = o.upper && typeof t === 'string' ? t.toLocaleUpperCase('pt-PT') : t;
    this.s.addText(str, {
      x: x / 96, y: y / 96, w: w / 96, h: h / 96, margin: 0,
      fontFace: o.font || this.T.fonts.text, fontSize: Math.round((o.size || 40) * 0.75 * 2) / 2,
      color: hex(o.color || this.T.c.ink), bold: !!o.bold, italic: !!o.italic,
      align: o.align || 'left', valign: o.valign || 'top',
      ...(o.spacing ? { charSpacing: o.spacing * 0.75 } : {}),
      ...(o.glow ? { glow: { size: o.glow.size, opacity: o.glow.opacity, color: hex(o.glow.color) } } : {}),
      ...(o.paraSpace ? { paraSpaceAfter: o.paraSpace } : {}),
    });
  }

  shape(type, [x, y, w, h], o = {}) {
    this.s.addShape(type, {
      x: x / 96, y: y / 96, w: w / 96, h: h / 96,
      ...(o.fill ? { fill: { color: hex(o.fill), ...(o.alpha !== undefined ? { transparency: Math.round((1 - o.alpha) * 100) } : {}) } } : {}),
      ...(o.line ? { line: { color: hex(o.line), width: (o.lineW || 1) * 0.75 } } : {}),
      ...(o.radius ? { rectRadius: o.radius / 96 } : {}),
      ...(o.glow ? { shadow: { type: 'outer', color: hex(o.glow), blur: 12, offset: 0, angle: 0, opacity: 0.65 } } : {}),
    });
  }

  rect(box, o) { this.shape(this.pptx.ShapeType.rect, box, o); }
  round(box, o) { this.shape(this.pptx.ShapeType.roundRect, box, o); }
  oval(box, o) { this.shape(this.pptx.ShapeType.ellipse, box, o); }
}

// ---------------------------------------------------------------------------
// Fundos (canvas)
// ---------------------------------------------------------------------------

function renderArt(T, art) {
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W * ART_SCALE;
  canvas.height = SLIDE_H * ART_SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(ART_SCALE, ART_SCALE);
  ctx.fillStyle = T.c.bg;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  if (art) art(ctx);
  return canvas;
}

function circle(ctx, x, y, r, { fill, stroke, width = 2, alpha = 1 }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  ctx.restore();
}

function vGradient(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, SLIDE_H);
  stops.forEach(([at, c]) => g.addColorStop(at, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
}

// Gerador determinístico: os fundos ficam sempre iguais.
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function stars(ctx, seed, n) {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) circle(ctx, r() * SLIDE_W, r() * SLIDE_H, 0.8 + r() * 1.8, { fill: '#fff', alpha: 0.3 + r() * 0.6 });
}

function contours(ctx, cx, cy, n, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + i * 7, cy - i * 5, 90 + i * 62, 60 + i * 50, -18 * Math.PI / 180, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function fadoStrings(ctx, x0, x1, spread) {
  ctx.strokeStyle = '#c7273a';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.75;
  for (let i = 0; i < 12; i++) {
    const o = (i - 5.5) * spread;
    ctx.beginPath();
    ctx.moveTo(x0 + o, 760);
    ctx.lineTo(x1 + o * 0.28, -40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const VINIL = ['#e8622a', '#e9a820', '#d9405e', '#2a9d8f'];
function vinylRings(ctx, cx, cy, base, step) {
  VINIL.forEach((c, i) => circle(ctx, cx, cy, (base - i * step) / 2, { fill: c }));
  circle(ctx, cx, cy, (base - 4 * step) / 2, { fill: '#1d1410' });
}

const METRO_LINES = ['#b5562b', '#4a8fdc', '#34a56a', '#a55ac8', '#e0a410', '#a9743c', '#e0483a', '#22a3ad'];
function metroMap(ctx) {
  ctx.lineWidth = 11;
  ctx.lineJoin = 'round';
  METRO_LINES.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(660 + i * 34, 760);
    ctx.lineTo(660 + i * 34, 560 - i * 16);
    ctx.lineTo(880 + i * 34, 340 - i * 16);
    ctx.lineTo(880 + i * 34, -40);
    ctx.stroke();
  });
}

function stainedGlass(ctx, x0, w, seed) {
  const COLORS = ['#b3202f', '#1f4fa8', '#d9921a', '#1c7a55', '#5b2c8a'];
  const r = seeded(seed);
  const size = 120;
  ctx.strokeStyle = '#0c0c10';
  ctx.lineWidth = 6;
  for (let y = 0; y < SLIDE_H; y += size) for (let x = x0; x < x0 + w; x += size) {
    const up = ((x - x0) + y) % (size * 2) === 0;
    const tris = up
      ? [[[x, y], [x + size, y], [x, y + size]], [[x + size, y], [x + size, y + size], [x, y + size]]]
      : [[[x, y], [x + size, y], [x + size, y + size]], [[x, y], [x + size, y + size], [x, y + size]]];
    tris.forEach(t => {
      ctx.fillStyle = COLORS[Math.floor(r() * COLORS.length)];
      ctx.beginPath();
      t.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }
}

const CONFETTI = ['#ff4f9a', '#ffd23c', '#24d1c4'];
function confetti(ctx, spots) {
  spots.forEach(([kind, x, y, c, rot = 0]) => {
    const color = CONFETTI[c];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (kind === 'z') {
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(20 + i * 40, i % 2 ? 34 : -34, 40 + i * 40, 0);
      ctx.stroke();
    } else if (kind === 't') {
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(32, 24);
      ctx.lineTo(-32, 24);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'd') {
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
}
const SPOTS_BIG = [['z', 90, 90, 0, 8], ['t', 1130, 110, 1, 20], ['o', 1020, 70, 2], ['d', 1210, 240, 0], ['t', 130, 620, 2, -15], ['z', 900, 640, 1, -6], ['d', 60, 420, 1], ['o', 1180, 560, 0], ['d', 300, 660, 0]];
const SPOTS_SMALL = [['z', 1060, 60, 0, 6], ['d', 1236, 130, 1], ['t', 1246, 690, 2, 15], ['o', 34, 690, 1]];

function auroraBlob(ctx, cx, cy, rx, ry, color, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
function aurora(ctx, k) {
  auroraBlob(ctx, 280, 90, 620, 330, '#19e0a0', 0.8 * k);
  auroraBlob(ctx, 740, 0, 560, 360, '#17a9c9', 0.73 * k);
  auroraBlob(ctx, 1180, 100, 520, 360, '#8a4be0', 0.73 * k);
}

// ---------------------------------------------------------------------------
// Peças por omissão (cada template substitui o que precisar)
// ---------------------------------------------------------------------------

const BASE = {
  promptMax: 62,
  optSize: 54,
  optIndent: 78,
  optH: 96,
  optGap: 22,
  wordSize: 58,
  wordH: 170,
  guilPrompt: 46,
  answerSize: 42,
  prompt: {},       // estilo da pergunta
  letter: {},       // estilo das letras A, B, C…

  promptStyle() { return { font: this.fonts.text, ...this.prompt }; },

  option(p, b, i, txt, size) {
    this.optionLetter(p, b, i, size);
    p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent, b.h], { size, valign: 'middle' });
  },
  optionLetter(p, b, i, size) {
    p.text(LETTERS[i], [b.x, b.y, this.optIndent - 10, b.h], { size, valign: 'middle', font: this.fonts.title, color: this.c.accent, ...this.letter });
  },

  word(p, b, w, size) {
    p.text(w, [b.x, b.y, b.w, b.h], { size, align: 'center', valign: 'middle', font: this.fonts.title });
  },

  guilhotina(p, q) {
    const A = this.guilArea || this.area;
    const align = this.prompt.align || 'left';
    p.text(promptOf(q), [A.x, A.y, A.w, 70], { ...this.promptStyle(), size: this.guilPrompt, align });
    const gap = 26;
    const top = A.y + 92;
    const w = (A.w - gap) / 2;
    const h = Math.min(this.wordH, (A.y + A.h - top - gap) / 2);
    const size = Math.min(...q.words.map(word => fitSize(word || '?', this.wordStyle(), w - 30, h, this.wordSize, 24)));
    q.words.forEach((word, i) => this.word(p, { x: A.x + (i % 2) * (w + gap), y: top + Math.floor(i / 2) * (h + gap), w, h }, word.trim() || '?', size, i));
  },
  wordStyle() { return { font: this.fonts.title }; },

  // Slide só com a resposta, em destaque (apresentação de respostas).
  answerBlock(p, q) {
    const A = this.area;
    const bold = this.answerBold;
    if (q.type === 'match' && q.pairs.length) {
      const n = q.pairs.length;
      const h = Math.min(90, (A.h - 12 * (n - 1)) / n);
      const leftW = A.w * 0.54;
      const rightW = A.w - leftW - 30;
      const style = { font: this.fonts.text, bold };
      const size = Math.min(...q.pairs.flatMap(pair => [
        fitSize(pair.left, { font: this.fonts.text }, leftW - 66, h, 48, 20),
        fitSize(pair.right, style, rightW - 66, h, 48, 20),
      ]));
      const top = A.y + breathing(A.h, n * h + (n - 1) * 12);
      q.pairs.forEach((pair, i) => {
        const y = top + i * (h + 12);
        const right = A.x + leftW + 30;
        p.text(LETTERS[i], [A.x, y, 56, h], { size, font: this.fonts.title, color: this.c.accent, valign: 'middle' });
        p.text(pair.left, [A.x + 62, y, leftW - 62, h], { size, valign: 'middle' });
        p.text(String(matchNumber(q, i)), [right, y, 56, h], { size, bold, font: this.fonts.title, color: ANSWER_GREEN, valign: 'middle' });
        p.text(pair.right, [right + 62, y, rightW - 62, h], { size, bold, color: ANSWER_GREEN, valign: 'middle' });
      });
      return;
    }
    const answer = answerOf(q) || '?';
    const size = fitSize(answer, { font: this.fonts.title, bold }, A.w, A.h - 40, 120, 30);
    p.text(answer, [A.x, A.y, A.w, A.h - 40], { font: this.fonts.title, size, bold, color: ANSWER_GREEN, align: 'center', valign: 'middle' });
  },
  answerBold: true,

  reveal(p, q) {
    const A = this.area;
    const answer = answerOf(q) || '?';
    p.text(q.question, [A.x, A.y, A.w, 130], { size: 34, color: this.c.muted, align: 'center', valign: 'middle' });
    const size = fitSize(answer, { font: this.fonts.title }, A.w, 280, 130, 40);
    p.text(answer, [A.x, A.y + 150, A.w, 300], { font: this.fonts.title, size, color: this.c.accent, align: 'center', valign: 'middle' });
  },
};

// ---------------------------------------------------------------------------
// Os templates
// ---------------------------------------------------------------------------

const TEMPLATE_LIST = [
  {
    id: 'atlantico', name: 'Atlântico', blurb: 'Azul-noite e areia, sóbrio e editorial',
    fonts: { title: 'Palatino Linotype', text: 'Palatino Linotype', label: 'Segoe UI Semibold' },
    c: { bg: '#0b1a29', ink: '#f3efe6', muted: '#a9b8c6', accent: '#e8c98f', line: '#38506a' },
    area: { x: 110, y: 160, w: 1060, h: 500 },
    letter: { italic: true },
    thumb: { x: 104, y: 400, size: 130, align: 'left' },
    art: {
      cover(ctx) {
        circle(ctx, 1120, 240, 320, { stroke: '#e8c98f', alpha: 0.55 });
        circle(ctx, 1120, 240, 200, { stroke: '#e8c98f', alpha: 0.55 });
        ctx.fillStyle = '#38506a';
        ctx.fillRect(110, 470, 560, 1);
      },
      section(ctx) { ctx.fillStyle = '#38506a'; ctx.fillRect(110, 450, 560, 1); },
    },
    kick(p, t, box, color) { p.text(t, box, { font: this.fonts.label, size: 27, spacing: 5, upper: true, color: color || this.c.accent }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [110, 226, 900, 40]);
      p.text(title, [104, 268, 760, 190], { font: this.fonts.title, size: fitSize(title, { font: this.fonts.title }, 760, 190, 150, 60) });
    },
    section(p, { kicker, title, big, extra }) {
      if (big) p.text(String(big), [700, 0, 540, 720], { font: this.fonts.title, size: 560, color: '#12283d', align: 'right', valign: 'middle' });
      this.kick(p, kicker, [110, 266, 900, 40]);
      p.text(title, [106, 312, 1060, 130], { font: this.fonts.title, size: fitSize(title, { font: this.fonts.title }, 1060, 130, 100, 44) });
      if (extra) p.text(extra, [110, 470, 1060, 50], { size: 30, color: this.c.muted });
    },
    header(p, i) {
      this.kick(p, i.kick, [110, 66, 860, 40], i.color);
      if (i.n) p.text(i.n, [980, 46, 190, 84], { font: this.fonts.title, size: 70, color: this.c.accent, align: 'right' });
    },
    option(p, b, i, txt, size) {
      p.rect([b.x, b.y, b.w, 1], { fill: this.c.line });
      BASE.option.call(this, p, { ...b, y: b.y + 6, h: b.h - 6 }, i, txt, size);
    },
    word(p, b, w, size) {
      p.rect([b.x, b.y, b.w, b.h], { line: '#4b6783' });
      BASE.word.call(this, p, b, w, size);
    },
  },

  {
    id: 'neon', name: 'Néon', blurb: 'Letreiro magenta e ciano sobre preto',
    fonts: { title: 'Bahnschrift Condensed', text: 'Bahnschrift Condensed', label: 'Bahnschrift Condensed' },
    c: { bg: '#09090f', ink: '#f2f2f8', muted: '#b9b9c9', accent: '#ff3b8f', cyan: '#2ee6e6' },
    area: { x: 80, y: 150, w: 1120, h: 530 },
    promptMax: 72, optSize: 58, wordSize: 66,
    wordStyle() { return { font: this.fonts.title, upper: true }; },
    thumb: { x: 640, y: 400, size: 170, align: 'center', color: '#2ee6e6', upper: true },
    art: {},
    neon(p, t, box, o) {
      const color = o.color;
      p.text(t, box, { ...o, font: this.fonts.title, upper: true, glow: { size: 11, opacity: 0.45, color } });
    },
    cover(p, { title, sub }) {
      const words = title.split(/\s+/);
      const mid = Math.max(1, Math.floor(words.length / 2));
      const [a, b] = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      const style = { font: this.fonts.title, upper: true };
      if (b) {
        const size = Math.min(fitSize(a, style, 1100, 260, 210, 60), fitSize(b, style, 1100, 260, 210, 60));
        this.neon(p, a, [90, 90, 1100, 260], { size, color: this.c.accent, align: 'center', valign: 'middle', spacing: 10 });
        this.neon(p, b, [90, 290, 1100, 260], { size, color: this.c.cyan, align: 'center', valign: 'middle', spacing: 10 });
      } else {
        this.neon(p, a, [90, 200, 1100, 240], { size: fitSize(a, style, 1100, 240, 210, 60), color: this.c.cyan, align: 'center', valign: 'middle', spacing: 10 });
      }
      if (sub) p.text(sub, [90, 560, 1100, 50], { size: 34, spacing: 5, upper: true, color: this.c.muted, align: 'center' });
    },
    section(p, { kicker, title, extra }) {
      this.neon(p, kicker, [90, 190, 1100, 90], { size: 64, color: this.c.accent, align: 'center', valign: 'middle', spacing: 12 });
      this.neon(p, title, [60, 290, 1160, 170], { size: fitSize(title, { font: this.fonts.title, upper: true }, 1160, 170, 130, 50), color: this.c.cyan, align: 'center', valign: 'middle' });
      if (extra) p.text(extra, [90, 490, 1100, 50], { size: 32, color: this.c.muted, align: 'center' });
    },
    header(p, i) {
      const label = i.n ? `PERGUNTA ${i.n}` : i.kick.toLocaleUpperCase('pt-PT');
      const w = textWidth(label, { font: this.fonts.label }, 32) + 56;
      p.round([80, 54, w, 58], { line: this.c.accent, lineW: 2, radius: 29, glow: this.c.accent });
      p.text(label, [80, 54, w, 58], { size: 32, color: this.c.accent, align: 'center', valign: 'middle' });
      if (i.n) p.text(i.kick, [80 + w + 30, 60, 1120 - w - 30, 46], { size: 32, spacing: 3, upper: true, color: this.c.cyan, align: 'right', valign: 'middle' });
    },
    option(p, b, i, txt, size) {
      p.round([b.x, b.y, b.w, b.h], { line: this.c.cyan, lineW: 2, radius: 14, glow: this.c.cyan });
      p.text(LETTERS[i], [b.x + 30, b.y, 50, b.h], { size, color: this.c.accent, valign: 'middle' });
      p.text(txt, [b.x + 92, b.y, b.w - 106, b.h], { size, valign: 'middle' });
    },
    optIndent: 106, optH: 112,
    word(p, b, w, size) {
      p.round([b.x, b.y, b.w, b.h], { line: this.c.cyan, lineW: 2, radius: 14, glow: this.c.cyan });
      p.text(w, [b.x, b.y, b.w, b.h], { size, upper: true, spacing: 2, align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'laurissilva', name: 'Laurissilva', blurb: 'Verde-floresta com curvas de nível',
    fonts: { title: 'Constantia', text: 'Constantia', label: 'Corbel' },
    c: { bg: '#0e2119', ink: '#f2eddf', muted: '#b4c2ae', accent: '#a9c86e', panel: '#17352a' },
    area: { x: 300, y: 145, w: 880, h: 525 },
    optIndent: 66, letter: { italic: true },
    thumb: { x: 104, y: 400, size: 130, align: 'left' },
    art: {
      cover(ctx) { contours(ctx, 1020, 560, 11, '#2c5240'); },
      section(ctx) { contours(ctx, 1100, 120, 9, '#2c5240'); },
    },
    kick(p, t, box) { p.text(t, box, { font: this.fonts.label, bold: true, size: 27, spacing: 3.5, upper: true, color: this.c.accent }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [110, 216, 900, 40]);
      p.text(title, [104, 262, 860, 190], { font: this.fonts.title, size: fitSize(title, { font: this.fonts.title }, 860, 190, 150, 60) });
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [110, 266, 900, 40]);
      p.text(title, [106, 312, 1000, 130], { font: this.fonts.title, size: fitSize(title, { font: this.fonts.title }, 1000, 130, 104, 44) });
      if (extra) p.text(extra, [110, 460, 1000, 50], { size: 30, color: this.c.muted });
    },
    header(p, i) {
      if (i.n) p.text(i.n, [50, 78, 220, 140], { font: this.fonts.title, size: i.n.length > 2 ? 90 : 118, color: this.c.accent, align: 'right' });
      this.kick(p, i.kick, [300, 88, 880, 40]);
    },
    word(p, b, w, size) {
      p.rect([b.x, b.y, b.w, b.h], { fill: this.c.panel });
      p.rect([b.x, b.y + b.h - 3, b.w, 3], { fill: this.c.accent });
      BASE.word.call(this, p, b, w, size);
    },
  },

  {
    id: 'constelacao', name: 'Constelação', blurb: 'Céu violeta com estrelas',
    fonts: { title: 'Century Gothic', text: 'Century Gothic', label: 'Century Gothic' },
    c: { bg: '#120f35', ink: '#ffffff', muted: '#c6c1e6', accent: '#ffe08a' },
    area: { x: 90, y: 125, w: 1100, h: 555 },
    prompt: { bold: true }, promptMax: 56, optSize: 48, optIndent: 96,
    wordStyle() { return { font: this.fonts.title, bold: true }; },
    thumb: { x: 96, y: 410, size: 92, align: 'left', bold: true },
    art: {
      cover(ctx) {
        skyViolet(ctx);
        stars(ctx, 11, 150);
        const pts = [[760, 110], [880, 190], [1010, 150], [1120, 270], [1050, 390], [900, 340]];
        ctx.strokeStyle = '#ffe08a';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineTo(880, 190);
        ctx.stroke();
        ctx.globalAlpha = 1;
        pts.forEach(([x, y]) => circle(ctx, x, y, 6, { fill: '#ffe08a' }));
      },
      section(ctx) { skyViolet(ctx); stars(ctx, 23, 150); },
      question(ctx) { skyViolet(ctx); stars(ctx, 37, 90); },
      guil(ctx) {
        skyViolet(ctx);
        stars(ctx, 41, 90);
        ctx.strokeStyle = '#ffe08a';
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        [[280, 300], [1000, 300], [280, 590], [1000, 590]].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.moveTo(640, 445);
          ctx.lineTo(x, y);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        circle(ctx, 640, 445, 9, { fill: '#ffe08a' });
      },
    },
    kick(p, t, box, align) { p.text(t, box, { size: 26, spacing: 4.5, upper: true, color: this.c.accent, align: align || 'left' }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [100, 286, 700, 40]);
      p.text(title, [96, 330, 700, 300], { bold: true, size: fitSize(title, { font: this.fonts.title, bold: true }, 700, 300, 124, 50) });
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [100, 262, 1080, 40], 'center');
      p.text(title, [100, 312, 1080, 130], { bold: true, align: 'center', size: fitSize(title, { font: this.fonts.title, bold: true }, 1080, 130, 92, 40) });
      if (extra) p.text(extra, [100, 460, 1080, 50], { size: 28, color: this.c.muted, align: 'center' });
    },
    header(p, i) {
      this.kick(p, i.kick, [90, 60, 900, 40]);
      if (i.n) p.text(i.n, [1000, 40, 190, 74], { size: 58, bold: true, color: this.c.accent, align: 'right' });
    },
    option(p, b, i, txt, size) {
      const d = Math.min(72, b.h - 8);
      const y = b.y + (b.h - d) / 2;
      p.oval([b.x, y, d, d], { line: this.c.accent, lineW: 2 });
      p.text(LETTERS[i], [b.x, y, d, d], { size: d * 0.47, color: this.c.accent, align: 'center', valign: 'middle' });
      p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent, b.h], { size, valign: 'middle' });
    },
    guilhotina(p, q) {
      p.text(promptOf(q), [90, 116, 1100, 70], { size: 44, align: 'center' });
      const spots = [[60, 240], [800, 240], [60, 540], [800, 540]];
      const size = Math.min(...q.words.map(w => fitSize(w || '?', this.wordStyle(), 420, 90, 60, 26)));
      q.words.forEach((w, i) => p.text(w.trim() || '?', [spots[i][0], spots[i][1], 420, 90], { size, bold: true, align: 'center', valign: 'middle' }));
    },
  },

  {
    id: 'vinil', name: 'Vinil', blurb: 'Anos 70, faixas curvas e letra redonda',
    fonts: { title: 'Cooper Black', text: 'Cooper Black', label: 'Century Gothic' },
    c: { bg: '#1d1410', ink: '#f8e9cf', muted: '#d8c6a8', accent: '#e9a820' },
    area: { x: 90, y: 130, w: 1030, h: 550 },
    promptMax: 58, optSize: 50, optIndent: 100, wordSize: 60,
    answerBold: false, // a Cooper Black já é pesada; o negrito falso borra-a
    guilArea: { x: 90, y: 124, w: 1100, h: 556 },
    thumb: { x: 90, y: 300, size: 130, align: 'left' },
    art: {
      cover(ctx) { vinylRings(ctx, 1130, 640, 1000, 120); },
      section(ctx) { vinylRings(ctx, 1180, 100, 760, 90); },
      question(ctx) { vinylRings(ctx, 1250, 30, 240, 30); },
    },
    kick(p, t, box) { p.text(t, box, { font: this.fonts.label, bold: true, size: 27, spacing: 4, upper: true, color: this.c.accent }); },
    cover(p, { title, sub }) {
      p.text(title, [90, 120, 640, 360], { font: this.fonts.title, size: fitSize(title, { font: this.fonts.title }, 640, 360, 170, 60) });
      if (sub) this.kick(p, sub, [96, 490, 640, 40]);
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [90, 266, 800, 40]);
      p.text(title, [86, 312, 760, 230], { size: fitSize(title, { font: this.fonts.title }, 760, 230, 96, 40) });
      if (extra) p.text(extra, [90, 560, 760, 90], { font: this.fonts.label, size: 28, color: this.c.muted });
    },
    header(p, i) {
      const w = i.n ? textWidth(i.n, { font: this.fonts.title }, 60) + 22 : 0;
      if (i.n) p.text(i.n, [90, 40, w, 76], { font: this.fonts.title, size: 60, color: this.c.accent });
      this.kick(p, i.kick, [90 + w, 62, 960 - w, 40]);
    },
    option(p, b, i, txt, size) {
      const d = Math.min(78, b.h - 6);
      const y = b.y + (b.h - d) / 2;
      p.oval([b.x, y, d, d], { fill: VINIL[i % 4] });
      p.text(LETTERS[i], [b.x, y, d, d], { size: d * 0.5, color: '#1d1410', align: 'center', valign: 'middle' });
      p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent, b.h], { size, valign: 'middle' });
    },
    word(p, b, w, size, i) {
      p.round([b.x, b.y, b.w, b.h], { fill: VINIL[i % 4], radius: 26 });
      p.text(w, [b.x, b.y, b.w, b.h], { size, color: '#1d1410', align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'fado', name: 'Fado', blurb: 'Preto e carmim, com as cordas da guitarra',
    fonts: { title: 'Palatino Linotype', text: 'Palatino Linotype', label: 'Palatino Linotype' },
    c: { bg: '#0d0a0b', ink: '#f4ece4', muted: '#bfb2a8', accent: '#e0525f', line: '#4a2a2e', crimson: '#c7273a' },
    area: { x: 100, y: 150, w: 1050, h: 520 },
    promptMax: 64, letter: { italic: true }, guilPrompt: 50,
    thumb: { x: 104, y: 400, size: 120, align: 'left', italic: true },
    art: {
      cover(ctx) { fadoStrings(ctx, 1010, 1100, 26); },
      section(ctx) { fadoStrings(ctx, 1120, 1180, 16); },
      question(ctx) { fadoStrings(ctx, 1222, 1240, 9); },
    },
    wordStyle() { return { font: this.fonts.title, italic: true }; },
    kick(p, t, box) { p.text(t, box, { size: 40, italic: true, color: this.c.accent }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [110, 226, 860, 56]);
      p.text(title, [104, 284, 860, 190], { italic: true, font: this.fonts.title, size: fitSize(title, { font: this.fonts.title, italic: true }, 860, 190, 150, 60) });
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [110, 250, 900, 56]);
      p.text(title, [104, 312, 960, 130], { italic: true, size: fitSize(title, { font: this.fonts.title, italic: true }, 960, 130, 112, 44) });
      if (extra) p.text(extra, [110, 460, 960, 50], { size: 30, color: this.c.muted });
    },
    header(p, i) {
      this.kick(p, i.kick, [100, 54, 860, 56]);
      if (i.n) p.text(i.n, [960, 40, 200, 100], { size: 76, italic: true, color: this.c.accent, align: 'right' });
    },
    option(p, b, i, txt, size) {
      BASE.option.call(this, p, { ...b, h: b.h - 8 }, i, txt, size);
      p.rect([b.x, b.y + b.h - 4, b.w, 1], { fill: this.c.line });
    },
    word(p, b, w, size) {
      p.text(w, [b.x, b.y, b.w, b.h - 6], { size, italic: true, valign: 'middle' });
      p.rect([b.x, b.y + b.h - 3, b.w, 2], { fill: this.c.crimson });
    },
  },

  {
    id: 'madrugada', name: 'Madrugada', blurb: 'O céu antes do nascer do sol',
    fonts: { title: 'Palatino Linotype', text: 'Palatino Linotype', label: 'Palatino Linotype' },
    c: { bg: '#140d29', ink: '#fbf1e6', muted: '#dcc6c4', accent: '#f9c9a0' },
    area: { x: 110, y: 130, w: 1060, h: 540 },
    prompt: { align: 'center' }, letter: { italic: true }, wordH: 150, wordSize: 56, guilPrompt: 50,
    wordStyle() { return { font: this.fonts.title, italic: true }; },
    thumb: { x: 640, y: 300, size: 130, align: 'center' },
    art: {
      cover(ctx) { dawn(ctx); circle(ctx, 640, 740, 180, { fill: '#f7c68c' }); },
      section(ctx) { dawn(ctx); circle(ctx, 640, 750, 110, { fill: '#f7c68c' }); },
      question(ctx) { vGradient(ctx, [[0, '#140d29'], [0.62, '#2a1540'], [1, '#54224e']]); },
    },
    kick(p, t, box) { p.text(t, box, { size: 26, spacing: 5, upper: true, color: this.c.accent, align: 'center' }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [90, 126, 1100, 40]);
      p.text(title, [90, 174, 1100, 190], { font: this.fonts.title, align: 'center', size: fitSize(title, { font: this.fonts.title }, 1100, 190, 160, 60) });
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [90, 186, 1100, 40]);
      p.text(title, [90, 236, 1100, 130], { italic: true, align: 'center', size: fitSize(title, { font: this.fonts.title, italic: true }, 1100, 130, 108, 44) });
      if (extra) p.text(extra, [90, 384, 1100, 50], { size: 30, color: this.c.muted, align: 'center' });
    },
    header(p, i) {
      this.kick(p, i.kick, [190, 62, 900, 40]);
      if (i.n) p.text(i.n, [1000, 40, 170, 76], { size: 60, color: this.c.accent, align: 'right' });
    },
    option(p, b, i, txt, size) {
      p.text([
        { text: `${LETTERS[i]}  `, options: { italic: true, color: hex(this.c.accent) } },
        { text: txt },
      ], [b.x, b.y, b.w, b.h], { size, align: 'center', valign: 'middle' });
    },
    optIndent: 0,
    word(p, b, w, size) {
      p.round([b.x, b.y, b.w, b.h], { fill: '#ffffff', alpha: 0.08, line: '#7d6a8a', radius: b.h / 2 });
      p.text(w, [b.x, b.y, b.w, b.h], { size, italic: true, align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'metro', name: 'Metro', blurb: 'Cada tema é uma linha, cada pergunta uma estação',
    fonts: { title: 'Bahnschrift SemiBold', text: 'Bahnschrift SemiBold', label: 'Bahnschrift' },
    c: { bg: '#121417', ink: '#f4f5f6', muted: '#9aa3ad', accent: '#4a8fdc' },
    area: { x: 90, y: 165, w: 1100, h: 515 },
    promptMax: 64, optSize: 54, optIndent: 104,
    thumb: { x: 86, y: 400, size: 116, align: 'left' },
    art: { cover: metroMap },
    stops(p, color, total, cur, y) {
      p.rect([90, y - 6, 1100, 12], { fill: color });
      if (total < 2) return;
      const x = i => 90 + i * (1100 / (total - 1));
      const dot = (i, on) => {
        const r = on ? 20 : 12;
        p.oval([x(i) - r, y - r, r * 2, r * 2], { fill: on ? '#ffffff' : this.c.bg, line: on ? color : '#ffffff', lineW: 4 });
      };
      // Rondas muito longas: só a estação atual, senão os pontos colam-se.
      if (total <= 24) for (let i = 0; i < total; i++) { if (i !== cur) dot(i, false); }
      dot(cur, true);
    },
    cover(p, { title, sub }) {
      if (sub) p.text(sub, [90, 226, 560, 40], { font: this.fonts.label, size: 30, color: this.c.muted });
      p.text(title, [86, 270, 560, 290], { size: fitSize(title, { font: this.fonts.title }, 560, 290, 128, 50) });
    },
    section(p, { kicker, title, extra, color, stops }) {
      p.text(kicker, [90, 214, 1100, 44], { font: this.fonts.label, size: 30, color: this.c.muted });
      p.text(title, [86, 262, 1100, 130], { size: fitSize(title, { font: this.fonts.title }, 1100, 130, 108, 44) });
      this.stops(p, color || this.c.accent, stops || 2, 0, 470);
      if (extra) p.text(extra, [90, 520, 1100, 50], { font: this.fonts.label, size: 28, color: this.c.muted });
    },
    header(p, i) {
      p.text(i.kick, [90, 30, 800, 44], { font: this.fonts.label, size: 30, color: this.c.muted });
      if (i.n) p.text(`Estação ${i.n}`, [900, 30, 290, 44], { size: 30, align: 'right' });
      this.stops(p, i.color || this.c.accent, i.stop ? i.stop.total : 1, i.stop ? i.stop.i : 0, 112);
    },
    option(p, b, i, txt, size) {
      const d = Math.min(80, b.h - 6);
      const y = b.y + (b.h - d) / 2;
      p.oval([b.x, y, d, d], { fill: [METRO_LINES[1], METRO_LINES[2], METRO_LINES[6], METRO_LINES[4]][i % 4] });
      p.text(LETTERS[i], [b.x, y, d, d], { size: d * 0.52, color: '#ffffff', align: 'center', valign: 'middle' });
      p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent, b.h], { size, valign: 'middle' });
    },
    guilhotina(p, q, info) {
      const color = info.color || this.c.accent;
      p.text(promptOf(q), [90, 160, 1100, 80], { size: 56 });
      p.rect([130, 454, 1020, 12], { fill: color });
      const size = Math.min(...q.words.map(w => fitSize(w || '?', { font: this.fonts.title }, 270, 80, 72, 28)));
      q.words.forEach((w, i) => {
        const x = 160 + i * 280;
        p.oval([x - 17, 443, 34, 34], { fill: this.c.bg, line: '#ffffff', lineW: 4 });
        p.text(w.trim() || '?', [x - 135, i % 2 ? 490 : 350, 270, 90], { size, align: 'center', valign: 'middle' });
      });
      p.oval([1074, 414, 92, 92], { fill: '#ffffff', line: color, lineW: 7 });
      p.text('?', [1074, 414, 92, 92], { size: 60, color, align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'vitral', name: 'Vitral', blurb: 'Painel de vitral sobre preto',
    fonts: { title: 'Gill Sans MT', text: 'Gill Sans MT', label: 'Gill Sans MT' },
    c: { bg: '#0c0c10', ink: '#f5efe2', muted: '#bdb6a8', accent: '#e8ae3c' },
    area: { x: 90, y: 118, w: 1010, h: 562 },
    prompt: { bold: true }, letter: { bold: true }, optIndent: 72, wordSize: 60, guilPrompt: 50,
    wordStyle() { return { font: this.fonts.title, bold: true }; },
    thumb: { x: 96, y: 400, size: 110, align: 'left', bold: true },
    art: {
      cover(ctx) { stainedGlass(ctx, 880, 400, 7); },
      section(ctx) { stainedGlass(ctx, 1000, 280, 19); },
      question(ctx) { stainedGlass(ctx, 1160, 120, 31); },
    },
    kick(p, t, box) { p.text(t, box, { size: 28, spacing: 4, upper: true, color: this.c.accent }); },
    cover(p, { title, sub }) {
      if (sub) this.kick(p, sub, [100, 236, 740, 40]);
      p.text(title, [96, 282, 740, 300], { bold: true, size: fitSize(title, { font: this.fonts.title, bold: true }, 740, 300, 150, 60) });
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [100, 262, 860, 40]);
      p.text(title, [96, 312, 870, 130], { bold: true, size: fitSize(title, { font: this.fonts.title, bold: true }, 870, 130, 110, 44) });
      if (extra) p.text(extra, [100, 460, 860, 50], { size: 30, color: this.c.muted });
    },
    header(p, i) {
      this.kick(p, i.kick, [90, 56, 840, 40]);
      if (i.n) p.text(i.n, [940, 34, 160, 76], { size: 60, bold: true, color: this.c.accent, align: 'right' });
    },
    word(p, b, w, size) {
      p.rect([b.x, b.y, b.w, b.h], { line: this.c.accent, lineW: 4 });
      p.text(w, [b.x, b.y, b.w, b.h], { size, bold: true, align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'confetes', name: 'Confetes', blurb: 'Anos 80, rabiscos e sombras duras',
    fonts: { title: 'Century Gothic', text: 'Century Gothic', label: 'Century Gothic' },
    c: { bg: '#141318', ink: '#ffffff', muted: '#c9c6d2', accent: '#ffd23c' },
    area: { x: 80, y: 112, w: 1120, h: 568 },
    prompt: { bold: true }, promptMax: 56, optSize: 48, optIndent: 84, optH: 100, optGap: 30, guilPrompt: 44,
    wordStyle() { return { font: this.fonts.title, bold: true }; },
    thumb: { x: 640, y: 390, size: 150, align: 'center', bold: true, lower: true },
    art: {
      cover(ctx) { confetti(ctx, SPOTS_BIG); },
      section(ctx) { confetti(ctx, SPOTS_BIG); },
      question(ctx) { confetti(ctx, SPOTS_SMALL); },
    },
    kick(p, t, box, align) { p.text(t, box, { size: 28, bold: true, color: this.c.accent, align: align || 'left' }); },
    shadowed(p, t, box, size, color, off, align = 'center') {
      const [x, y, w, h] = box;
      p.text(t, [x + off, y + off, w, h], { size, bold: true, color, align, valign: 'middle' });
      p.text(t, box, { size, bold: true, align, valign: 'middle' });
    },
    cover(p, { title, sub }) {
      const t = title.toLocaleLowerCase('pt-PT');
      this.shadowed(p, t, [120, 200, 1040, 210], fitSize(t, { font: this.fonts.title, bold: true }, 1040, 210, 170, 60), '#ff4f9a', 7);
      if (sub) this.kick(p, sub, [120, 424, 1040, 40], 'center');
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker.toLocaleLowerCase('pt-PT'), [120, 236, 1040, 40], 'center');
      this.shadowed(p, title, [120, 286, 1040, 130], fitSize(title, { font: this.fonts.title, bold: true }, 1040, 130, 96, 40), '#24d1c4', 5);
      if (extra) p.text(extra, [120, 440, 1040, 50], { size: 28, color: this.c.muted, align: 'center' });
    },
    header(p, i) {
      this.kick(p, i.kick, [80, 54, 800, 40]);
      if (i.n) p.text(i.n, [880, 32, 160, 76], { size: 60, bold: true, color: this.c.accent, align: 'right' });
    },
    shadowBox(p, b, color) {
      p.rect([b.x + 9, b.y + 9, b.w, b.h], { fill: color });
      p.rect([b.x, b.y, b.w, b.h], { fill: this.c.bg, line: '#ffffff', lineW: 4 });
    },
    option(p, b, i, txt, size) {
      const color = CONFETTI[i % 3];
      this.shadowBox(p, b, color);
      p.text(LETTERS[i], [b.x + 26, b.y, 50, b.h], { size, bold: true, color, valign: 'middle' });
      p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent - 12, b.h], { size, bold: true, valign: 'middle' });
    },
    word(p, b, w, size, i) {
      this.shadowBox(p, b, CONFETTI[i % 3]);
      p.text(w, [b.x, b.y, b.w, b.h], { size, bold: true, align: 'center', valign: 'middle' });
    },
  },

  {
    id: 'aurora', name: 'Aurora', blurb: 'Aurora boreal sobre noite profunda',
    fonts: { title: 'Century Gothic', text: 'Century Gothic', label: 'Century Gothic' },
    c: { bg: '#06121b', ink: '#f2fbf8', muted: '#b7d2cc', accent: '#8ff0cb' },
    area: { x: 90, y: 130, w: 1100, h: 550 },
    prompt: { align: 'center' }, promptMax: 56, optSize: 48, optIndent: 96, optH: 100, wordSize: 58, wordH: 160, guilPrompt: 46,
    thumb: { x: 640, y: 440, size: 124, align: 'center' },
    art: {
      cover(ctx) { aurora(ctx, 1); },
      section(ctx) { aurora(ctx, 1); },
      question(ctx) { aurora(ctx, 0.5); },
    },
    kick(p, t, box) { p.text(t, box, { size: 26, spacing: 5, upper: true, color: '#eafff6', align: 'center' }); },
    cover(p, { title, sub }) {
      p.text(title, [90, 290, 1100, 170], { align: 'center', size: fitSize(title, { font: this.fonts.title }, 1100, 170, 136, 56) });
      if (sub) this.kick(p, sub, [90, 484, 1100, 40]);
    },
    section(p, { kicker, title, extra }) {
      this.kick(p, kicker, [90, 296, 1100, 40]);
      p.text(title, [90, 344, 1100, 130], { align: 'center', size: fitSize(title, { font: this.fonts.title }, 1100, 130, 96, 40) });
      if (extra) p.text(extra, [90, 490, 1100, 50], { size: 28, color: this.c.muted, align: 'center' });
    },
    header(p, i) {
      this.kick(p, i.kick, [190, 62, 900, 40]);
      if (i.n) p.text(i.n, [1030, 40, 160, 76], { size: 60, color: this.c.accent, align: 'right' });
    },
    option(p, b, i, txt, size) {
      p.round([b.x, b.y, b.w, b.h], { fill: '#ffffff', alpha: 0.08, radius: b.h / 2 });
      p.text(LETTERS[i], [b.x + 36, b.y, 50, b.h], { size, color: this.c.accent, valign: 'middle' });
      p.text(txt, [b.x + this.optIndent, b.y, b.w - this.optIndent - 24, b.h], { size, valign: 'middle' });
    },
    word(p, b, w, size) {
      p.round([b.x, b.y, b.w, b.h], { fill: '#ffffff', alpha: 0.08, radius: b.h / 2 });
      p.text(w, [b.x, b.y, b.w, b.h], { size, align: 'center', valign: 'middle' });
    },
  },
].map(t => ({ ...BASE, ...t }));

function skyViolet(ctx) {
  const g = ctx.createLinearGradient(0, 0, SLIDE_W, SLIDE_H);
  g.addColorStop(0, '#0c0f2e');
  g.addColorStop(0.7, '#1c1449');
  g.addColorStop(1, '#2a1a5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
}

function dawn(ctx) {
  vGradient(ctx, [[0, '#140d29'], [0.42, '#2a1540'], [0.74, '#7c2d55'], [0.94, '#e0795a'], [1, '#f3ad72']]);
}

const TEMPLATES = Object.fromEntries(TEMPLATE_LIST.map(t => [t.id, t]));
const TEMPLATE_IDS = TEMPLATE_LIST.map(t => t.id);

// ---------------------------------------------------------------------------
// Baralho: cria os slides a partir de um template
// ---------------------------------------------------------------------------

// Desce um bloco no espaço que sobra, para não ficar colado à pergunta.
function breathing(available, used) { return Math.max(0, (available - used) * 0.4); }

class Deck {
  constructor(T, pptx) {
    this.T = T;
    this.pptx = pptx;
    this.masters = new Set();
  }

  // Cada tipo de slide tem um master com o fundo: a imagem fica uma só vez no ficheiro.
  slide(kind) {
    const T = this.T;
    const art = T.art[kind] || (kind === 'guil' ? T.art.question : null) || null;
    const title = `${T.id}-${art ? kind : 'plain'}`;
    if (!this.masters.has(title)) {
      this.masters.add(title);
      const background = art
        ? { data: renderArt(T, art).toDataURL('image/png').replace(/^data:/, '') }
        : { color: hex(T.c.bg) };
      this.pptx.defineSlideMaster({ title, background });
    }
    return new Painter(this.pptx, this.pptx.addSlide({ masterName: title }), T);
  }

  cover(title, sub) { this.T.cover(this.slide('cover'), { title, sub }); }

  section(info) { this.T.section(this.slide('section'), info); }

  async question(info, withNotes) {
    const T = this.T;
    const q = info.q;
    const p = this.slide(q.type === 'guilhotina' ? 'guil' : 'question');
    T.header(p, info);
    if (q.type === 'guilhotina') T.guilhotina(p, q, info);
    else await this.body(p, q);
    if (withNotes) p.s.addNotes(noteLines(q).join('\n'));
  }

  async body(p, q) {
    const T = this.T;
    const A = T.area;
    const style = T.promptStyle();
    const text = promptOf(q) || '(pergunta em falta)';
    const list = q.type === 'choice' || q.type === 'match';
    const below = list || q.media;

    if (!below) {
      const h = q.unit ? A.h - 70 : A.h;
      const size = fitSize(text, style, A.w, h, Math.round(T.promptMax * 1.25), 28);
      p.text(text, [A.x, A.y, A.w, h], { ...style, size, valign: 'middle' });
      if (q.unit) p.text(`(resposta em ${q.unit})`, [A.x, A.y + A.h - 56, A.w, 50], { size: 28, italic: true, color: T.c.muted, align: style.align });
      return;
    }

    const size = fitSize(text, style, A.w, A.h * 0.42, T.promptMax, 28);
    const used = lineCount(text, style, size, A.w) * size * 1.22;
    p.text(text, [A.x, A.y, A.w, used + 8], { ...style, size });
    const top = A.y + used + 30;
    const zone = { x: A.x, y: top, w: A.w, h: A.y + A.h - top };

    if (q.media && list) {
      await addMediaTo(p, q.media, { ...zone, w: zone.w * 0.42 });
      const shift = zone.w * 0.46;
      this.lists(p, q, { ...zone, x: zone.x + shift, w: zone.w - shift });
    } else if (q.media) {
      await addMediaTo(p, q.media, zone);
    } else {
      this.lists(p, q, zone);
    }
  }

  lists(p, q, zone) {
    if (q.type === 'choice') this.options(p, q, zone);
    if (q.type === 'match') this.match(p, q, zone);
  }

  options(p, q, zone) {
    const T = this.T;
    const style = { font: T.fonts.text, ...(T.prompt.bold && T.id === 'confetes' ? { bold: true } : {}) };
    const n = q.options.length;
    const place = cols => {
      const rows = Math.ceil(n / cols);
      const w = (zone.w - T.optGap * 2 * (cols - 1)) / cols;
      const h = Math.min(T.optH, (zone.h - T.optGap * (rows - 1)) / rows);
      const size = Math.min(...q.options.map(o => fitSize(o, style, w - T.optIndent - 30, h, T.optSize, 20)));
      return { cols, rows, w, h, size };
    };
    const two = place(2);
    const one = place(1);
    const g = two.size >= one.size || one.h < 60 ? two : one;
    const top = zone.y + breathing(zone.h, g.rows * g.h + (g.rows - 1) * T.optGap);
    q.options.forEach((o, i) => {
      const c = i % g.cols;
      const r = Math.floor(i / g.cols);
      T.option(p, { x: zone.x + c * (g.w + T.optGap * 2), y: top + r * (g.h + T.optGap), w: g.w, h: g.h }, i, o, g.size);
    });
  }

  match(p, q, zone) {
    const T = this.T;
    const style = { font: T.fonts.text };
    const n = q.pairs.length;
    const w = (zone.w - 50) / 2;
    const h = Math.min(84, (zone.h - 12 * (n - 1)) / n);
    const left = q.pairs.map(pair => pair.left);
    const right = q.matchOrder.map(pi => q.pairs[pi].right);
    const size = Math.min(...[...left, ...right].map(t => fitSize(t, style, w - 66, h, 44, 20)));
    const row = (mark, t, x, y) => {
      p.text(mark, [x, y, 56, h], { size, font: T.fonts.title, color: T.c.accent, bold: true, valign: 'middle' });
      p.text(t, [x + 62, y, w - 62, h], { size, valign: 'middle' });
    };
    const top = zone.y + breathing(zone.h, n * h + (n - 1) * 12);
    left.forEach((t, i) => row(LETTERS[i], t, zone.x, top + i * (h + 12)));
    right.forEach((t, i) => row(String(i + 1), t, zone.x + w + 50, top + i * (h + 12)));
  }

  answers(title, items, color) {
    const T = this.T;
    const PER_SLIDE = 12;
    const pages = Math.ceil(items.length / PER_SLIDE);
    for (let i = 0; i < items.length; i += PER_SLIDE) {
      const chunk = items.slice(i, i + PER_SLIDE);
      const p = this.slide('question');
      const n = pages > 1 ? `${i / PER_SLIDE + 1}/${pages}` : '';
      T.header(p, { kick: title, n, color, answers: true });
      const A = T.area;
      const cols = chunk.length > 6 ? 2 : 1;
      const perCol = Math.ceil(chunk.length / cols);
      const gap = 50;
      const w = (A.w - gap * (cols - 1)) / cols;
      const style = { font: T.fonts.text };
      const rows = Math.max(1, perCol);
      let size = T.answerSize;
      while (size > 20 && chunk.some(it => lineCount(answerOf(it.q) || '?', style, size, w - size * 2.4) > Math.max(1, Math.floor(A.h / rows / (size * 1.5))))) size -= 2;
      for (let c = 0; c < cols; c++) {
        chunk.slice(c * perCol, (c + 1) * perCol).forEach((it, r) => {
          const rowH = Math.min(A.h / rows, size * 2.6);
          const y = A.y + r * rowH;
          const nw = size * 2.2;
          p.text(`${it.n}`, [A.x + c * (w + gap), y, nw, rowH], { size, font: T.fonts.title, color: T.c.accent, bold: true, valign: 'top' });
          p.text(answerOf(it.q) || '?', [A.x + c * (w + gap) + nw, y, w - nw, rowH], { size, valign: 'top' });
        });
      }
    }
  }

  answerSlide(info, withNotes) {
    const p = this.slide('question');
    this.T.header(p, { ...info, kick: 'Resposta' });
    this.T.answerBlock(p, info.q);
    if (withNotes) p.s.addNotes(noteLines(info.q).join('\n'));
  }

  reveal(q) {
    const p = this.slide('question');
    this.T.header(p, { kick: 'Aproximação · desempate', n: '', color: bright(APPROX.color) });
    this.T.reveal(p, q);
    return p;
  }
}

// ---------------------------------------------------------------------------
// Miniatura para o seletor
// ---------------------------------------------------------------------------

function templateThumb(T, title) {
  const canvas = renderArt(T, T.art.cover);
  const ctx = canvas.getContext('2d');
  const { x, y, size, align, bold, italic, color, upper, lower } = T.thumb;
  const family = T.fonts.title.replace(/ (SemiBold|Condensed)/g, '');
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px "${family}", sans-serif`;
  ctx.fillStyle = color || T.c.ink;
  ctx.textAlign = align;
  const shown = upper ? title.toLocaleUpperCase('pt-PT') : lower ? title.toLocaleLowerCase('pt-PT') : title;
  ctx.fillText(shown, x, y);
  return canvas;
}
