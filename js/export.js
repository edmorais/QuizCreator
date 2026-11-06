'use strict';

// ---------------------------------------------------------------------------
// Diálogo de exportação (template, ordem, respostas, formato)
// ---------------------------------------------------------------------------

const exportDialog = $('#export-dialog');

function openExport() {
  const p = quiz.presentation;
  $('#ex-mode').value = p.mode;
  $('#ex-size').value = String(p.roundSize);
  $('#ex-answers').value = p.answers;
  $('#ex-notes').checked = p.notes;
  renderTemplatePicker();
  renderOrderPreview();
  exportDialog.showModal();
}

// As miniaturas só se desenham uma vez: dependem do template, não do quiz.
function renderTemplatePicker() {
  const box = $('#ex-templates');
  if (!box.children.length) {
    box.replaceChildren(...TEMPLATE_LIST.map(T => el('button', {
      type: 'button', class: 'tpl-card', 'data-id': T.id, title: T.blurb,
      onclick: () => updatePresentation({ template: T.id }),
    }, templateThumb(T, 'Quiz Night'), el('span', {}, T.name))));
  }
  const current = quiz.presentation.template;
  box.querySelectorAll('.tpl-card').forEach(b => b.classList.toggle('selected', b.dataset.id === current));
  const T = TEMPLATES[current];
  const fonts = [...new Set(Object.values(T.fonts))].join(' · ').replace(/ (SemiBold|Semibold|Condensed)/g, '');
  $('#ex-template-info').textContent = `${T.blurb}. Tipos de letra: ${[...new Set(fonts.split(' · '))].join(' · ')}.`;
}

function renderOrderPreview() {
  const mixed = quiz.presentation.mode === 'mixed';
  $('#ex-size-wrap').hidden = !mixed;
  $('#ex-shuffle').hidden = !mixed;
  const madeira = el('div', { class: 'order-round' },
    el('span', { class: 'order-label' }, 'Início'),
    el('span', { class: 'order-chip', style: `--c:${APPROX.color}`, title: 'Aproximação' }, '≈'),
    el('span', { class: 'order-chip', style: `--c:${MADEIRA.color}`, title: 'Madeira' }, '1'),
  );
  const last = el('div', { class: 'order-round' },
    el('span', { class: 'order-label' }, 'Fim'),
    el('span', { class: 'order-chip' + (isFilled(quiz.guilhotina) ? '' : ' missing'), style: `--c:${GUILHOTINA.color}`, title: 'Guilhotina' }, String(guilhotinaNumber(quiz))),
  );
  $('#ex-order').replaceChildren(madeira, ...rounds(quiz).map(r => el('div', { class: 'order-round' },
    el('span', { class: 'order-label' }, r.title),
    r.items.map(it => el('span', {
      class: 'order-chip' + (isFilled(it.q) ? '' : ' missing'), style: `--c:${it.color}`,
      title: `${it.n} · ${it.themeName}: ${it.q.question || '(vazia)'}`,
    }, String(it.n))),
  )), last);
}

function updatePresentation(changes) {
  Object.assign(quiz.presentation, changes);
  save();
  render();
  renderTemplatePicker();
  renderOrderPreview();
}

$('#btn-export').onclick = openExport;
$('#ex-mode').addEventListener('change', e => updatePresentation({ mode: e.target.value }));
$('#ex-size').addEventListener('change', e => updatePresentation({ roundSize: Number(e.target.value) }));
$('#ex-answers').addEventListener('change', e => updatePresentation({ answers: e.target.value }));
$('#ex-notes').addEventListener('change', e => updatePresentation({ notes: e.target.checked }));
$('#ex-shuffle').onclick = () => updatePresentation({ order: mixedOrder(quiz.perTheme) });

exportDialog.addEventListener('close', async () => {
  const kind = exportDialog.returnValue;
  try {
    if (kind === 'pptx') {
      setSaveState('A gerar o PowerPoint…');
      await exportPptx(quiz);
      setSaveState('PowerPoint exportado');
    } else if (kind === 'answers') {
      setSaveState('A gerar o PowerPoint de respostas…');
      await exportAnswersPptx(quiz);
      setSaveState('PowerPoint de respostas exportado');
    } else if (kind === 'script') {
      download(`${baseFilename()}-guiao.md`, toScriptMarkdown(quiz), 'text/markdown');
    } else if (kind === 'marp') {
      download(`${baseFilename()}-slides.md`, toSlidesMarkdown(quiz), 'text/markdown');
    }
  } catch (err) {
    console.error(err);
    setSaveState('');
    alert('Erro na exportação:\n' + err.message);
  }
});

// ---------------------------------------------------------------------------
// Partes comuns
// ---------------------------------------------------------------------------

function noteLines(q) {
  const lines = [`Resposta: ${answerOf(q) || '?'}`];
  if (q.notes.trim()) lines.push(q.notes.trim());
  if (q.source.trim()) lines.push(`Fonte: ${q.source.trim()}`);
  if (q.media) lines.push(mediaLabel(q.media));
  return lines;
}

function headerSubtitle(qz) { return [formatDate(qz.meta.date), qz.meta.venue].filter(Boolean).join(' · '); }

// Enunciado a mostrar (na guilhotina é opcional e tem um texto por omissão).
function promptOf(q) {
  if (q.type === 'guilhotina') return q.question.trim() || GUILHOTINA_PROMPT;
  return q.question.trim();
}

function guilhotinaItem(qz) { return { n: guilhotinaNumber(qz), q: qz.guilhotina, color: GUILHOTINA.color }; }

// ---------------------------------------------------------------------------
// Markdown: guião do apresentador
// ---------------------------------------------------------------------------

function toScriptMarkdown(qz) {
  const out = [];
  const sub = headerSubtitle(qz);
  out.push(`# ${qz.meta.title} — guião do apresentador`);
  if (sub) out.push(`_${sub}_`);

  const item = (label, q) => {
    const lines = [`**${label}.** ${promptOf(q) || '_(pergunta em falta)_'}${q.points === 2 ? ' **(2 pontos)**' : ''}`];
    if (q.type === 'guilhotina') lines.push(q.words.map(w => `**${w.trim() || '?'}**`).join(' · '));
    if (q.type === 'choice') lines.push(q.options.map((o, i) => `${LETTERS[i]}) ${o}`).join(' · '));
    if (q.type === 'match') {
      lines.push(q.pairs.map((p, i) => `${LETTERS[i]}. ${p.left}`).join(' · '));
      lines.push(q.matchOrder.map((pi, k) => `${k + 1}. ${q.pairs[pi].right}`).join(' · '));
    }
    if (q.media) lines.push(`_${mediaLabel(q.media)}_`);
    lines.push(`→ **${answerOf(q) || '?'}**${q.verified ? '' : ' ⚠ por verificar'}`);
    if (qz.presentation.notes && q.notes.trim()) lines.push(`> ${q.notes.trim().replace(/\n/g, '\n> ')}`);
    if (qz.presentation.notes && q.source.trim()) lines.push(`<small>Fonte: ${q.source.trim()}</small>`);
    return lines.join('  \n');
  };

  out.push('## Início · aproximação (desempate)', item('Aproximação', qz.approximation));
  out.push('## Madeira', item('1', qz.madeira));
  rounds(qz).forEach(r => {
    out.push(`## ${r.title} · ${r.subtitle}`);
    r.items.forEach(it => out.push(item(`${it.n}${qz.presentation.mode === 'mixed' ? ` (${it.themeName})` : ''}`, it.q)));
  });
  out.push('## Guilhotina', item(String(guilhotinaNumber(qz)), qz.guilhotina));
  return out.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// Markdown: slides Marp
// ---------------------------------------------------------------------------

function toSlidesMarkdown(qz) {
  const opts = qz.presentation;
  const slides = [];
  const lead = (kicker, title) => `<!-- _class: lead -->\n\n# ${kicker}\n\n## ${title}`;
  const note = q => opts.notes ? `\n\n<!--\n${noteLines(q).join('\n').replace(/--/g, '—')}\n-->` : '';
  const body = q => {
    const lines = [promptOf(q) || '_(pergunta em falta)_'];
    if (q.type === 'guilhotina') lines.push('', q.words.map(w => `**${w.trim() || '?'}**`).join(' · '));
    if (q.media) {
      if (q.media.kind === 'image' && q.media.url) lines.push('', `![](${q.media.url})`);
      else lines.push('', `_[${MEDIA_KINDS[q.media.kind]}]_`);
    }
    if (q.type === 'choice') lines.push('', ...q.options.map((o, i) => `${LETTERS[i]}) ${o}  `));
    if (q.type === 'match') {
      lines.push('', '| | |', '|---|---|');
      const n = q.pairs.length;
      for (let i = 0; i < n; i++) lines.push(`| ${LETTERS[i]}. ${q.pairs[i].left} | ${i + 1}. ${q.pairs[q.matchOrder[i]].right} |`);
    }
    if (q.unit) lines.push('', `_(resposta em ${q.unit})_`);
    return lines.join('\n');
  };
  const answers = (title, items) => `## ${title}\n\n` + items.map(it => `${it.n}. **${answerOf(it.q) || '?'}**`).join('\n');
  const question = (label, theme, q) => `## ${label} · ${theme}${q.points === 2 ? ' · 2 pontos' : ''}\n\n${body(q)}${note(q)}`;

  const header = `---\nmarp: true\npaginate: true\ntitle: ${JSON.stringify(qz.meta.title)}\n---\n\n`;
  const sub = headerSubtitle(qz);
  slides.push(`# ${qz.meta.title}${sub ? '\n\n' + sub : ''}`);

  slides.push(lead('Para começar', 'Pergunta de aproximação'));
  slides.push(question('Aproximação', 'desempate', qz.approximation));
  slides.push(lead('Pergunta 1', 'Madeira'));
  slides.push(question('1', 'Madeira', qz.madeira));
  const madeiraItem = { n: 1, q: qz.madeira };
  if (opts.answers === 'round') slides.push(answers('Resposta · Madeira', [madeiraItem]));

  const rs = rounds(qz);
  rs.forEach(r => {
    slides.push(lead(r.title, r.subtitle));
    r.items.forEach(it => slides.push(question(it.n, it.themeName, it.q)));
    if (opts.answers === 'round') slides.push(answers(`Respostas · ${r.title}`, r.items));
  });
  const guil = guilhotinaItem(qz);
  slides.push(lead(`Pergunta ${guil.n}`, 'Guilhotina'));
  slides.push(question(guil.n, 'Guilhotina', qz.guilhotina));
  if (opts.answers === 'round') slides.push(answers('Resposta · Guilhotina', [guil]));
  if (opts.answers === 'end') {
    slides.push(lead('Respostas', ''));
    slides.push(answers('Madeira', [madeiraItem]));
    rs.forEach(r => slides.push(answers(`${r.title} · ${r.subtitle}`, r.items)));
    slides.push(answers('Guilhotina', [guil]));
  }
  if (opts.answers !== 'none') {
    slides.push(lead('Desempate', 'Resposta da aproximação'));
    slides.push(`# ${answerOf(qz.approximation) || '?'}\n\n${qz.approximation.question}`);
  }
  return header + slides.join('\n\n---\n\n') + '\n';
}

// ---------------------------------------------------------------------------
// PowerPoint (PptxGenJS): multimédia
// ---------------------------------------------------------------------------

// O PowerPoint usa a extensão derivada do MIME; alguns MIME do browser não servem.
const PPT_MIME_FIX = {
  'audio/mpeg': 'audio/mp3', 'audio/x-m4a': 'audio/m4a', 'audio/mp4': 'audio/m4a',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'video/quicktime': 'video/mov',
  'image/jpg': 'image/jpeg',
};

function pptxData(dataUrl) {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,/);
  if (!m) return dataUrl;
  const mime = PPT_MIME_FIX[m[1]] || m[1];
  return `${mime};base64,${dataUrl.slice(m[0].length)}`;
}

async function fetchAsDataURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return readFileAsDataURL(await res.blob());
}

function imageSize(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = src;
  });
}

function fitBox(box, ratio) {
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) { h = box.h; w = h * ratio; }
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// box em px (ver templates.js); o PptxGenJS trabalha em polegadas.
async function addMediaTo(p, m, boxPx) {
  const s = p.s;
  const box = { x: boxPx.x / 96, y: boxPx.y / 96, w: boxPx.w / 96, h: boxPx.h / 96 };
  const yt = youtubeId(m.url);
  if (yt) {
    s.addMedia({ type: 'online', link: `https://www.youtube.com/embed/${yt}`, ...fitBox(box, 16 / 9) });
    return;
  }
  let data = m.data;
  if (!data && m.url) {
    try { data = await fetchAsDataURL(m.url); } catch (e) { data = ''; }
  }
  if (!data) {
    // Não foi possível embutir (ex. site sem CORS): fica uma ligação.
    s.addText(`${MEDIA_KINDS[m.kind]}: ${m.url}`, { ...box, fontFace: p.T.fonts.text, fontSize: 16, color: hex(p.T.c.accent), align: 'center', valign: 'middle', hyperlink: { url: m.url } });
    return;
  }
  if (m.kind === 'image') {
    const { w, h } = await imageSize(data);
    s.addImage({ data: pptxData(data), ...fitBox(box, w / h) });
  } else if (m.kind === 'audio') {
    // Nunca mostrar o nome do ficheiro: pode revelar a resposta.
    s.addMedia({ type: 'audio', data: pptxData(data), x: box.x + box.w / 2 - 0.75, y: box.y + box.h / 2 - 0.75, w: 1.5, h: 1.5 });
  } else {
    s.addMedia({ type: 'video', data: pptxData(data), ...fitBox(box, 16 / 9) });
  }
}

// ---------------------------------------------------------------------------
// PowerPoint: sequência de slides
// ---------------------------------------------------------------------------

function newDeck(qz) {
  if (typeof PptxGenJS === 'undefined') {
    throw new Error('A biblioteca de PowerPoint não carregou. Verifica a ligação à internet e recarrega a página.');
  }
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = qz.meta.title;
  return new Deck(TEMPLATES[qz.presentation.template] || TEMPLATES[DEFAULT_TEMPLATE], pptx);
}

// Apresentação para corrigir: cada pergunta em dois slides, primeiro a pergunta
// e depois só a resposta, em destaque. A aproximação fica no fim (desempate).
async function buildAnswersPptx(qz) {
  const deck = newDeck(qz);
  const notes = qz.presentation.notes;
  const tint = bright;
  const pair = async info => {
    await deck.question(info, notes);
    deck.answerSlide(info, notes);
  };

  deck.cover(qz.meta.title, ['Respostas', headerSubtitle(qz)].filter(Boolean).join(' · '));

  const madeiraColor = tint(MADEIRA.color);
  deck.section({ kicker: 'Pergunta 1', title: 'Madeira', color: madeiraColor });
  await pair({ kick: 'Madeira', n: '1', color: madeiraColor, q: qz.madeira });

  for (const [index, r] of rounds(qz).entries()) {
    deck.section({ kicker: r.title, title: r.subtitle, color: tint(r.color), big: index + 1, stops: r.items.length });
    for (const [i, it] of r.items.entries()) {
      await pair({ kick: it.themeName, n: String(it.n), color: tint(it.color), q: it.q, stop: { i, total: r.items.length } });
    }
  }

  const guil = guilhotinaItem(qz);
  const guilColor = tint(GUILHOTINA.color);
  deck.section({ kicker: `Pergunta ${guil.n}`, title: 'Guilhotina', color: guilColor });
  await pair({ kick: 'Guilhotina', n: String(guil.n), color: guilColor, q: qz.guilhotina });

  const approxColor = tint(APPROX.color);
  deck.section({ kicker: 'Desempate', title: 'Pergunta de aproximação', color: approxColor });
  await pair({ kick: 'Aproximação', n: '', color: approxColor, q: qz.approximation });
  return deck.pptx;
}

async function buildPptx(qz) {
  const deck = newDeck(qz);
  const pptx = deck.pptx;
  const opts = qz.presentation;
  const tint = bright;

  deck.cover(qz.meta.title, headerSubtitle(qz));

  // Aproximação no início; a resposta só aparece no fim (desempate).
  const approxColor = tint(APPROX.color);
  deck.section({ kicker: 'Para começar', title: 'Pergunta de aproximação', extra: 'A resposta é um número e serve para desempatar no fim', color: approxColor });
  await deck.question({ kick: 'Aproximação', n: '', color: approxColor, q: qz.approximation }, opts.notes);

  const madeiraColor = tint(MADEIRA.color);
  const madeiraItem = { n: 1, q: qz.madeira };
  deck.section({ kicker: 'Pergunta 1', title: 'Madeira', color: madeiraColor });
  await deck.question({ kick: 'Madeira', n: '1', color: madeiraColor, q: qz.madeira }, opts.notes);
  if (opts.answers === 'round') deck.answers('Resposta · Madeira', [madeiraItem], madeiraColor);

  const rs = rounds(qz);
  for (const [index, r] of rs.entries()) {
    const color = tint(r.color);
    deck.section({ kicker: r.title, title: r.subtitle, color, big: index + 1, stops: r.items.length });
    for (const [i, it] of r.items.entries()) {
      await deck.question({ kick: it.themeName, n: String(it.n), color: tint(it.color), q: it.q, stop: { i, total: r.items.length } }, opts.notes);
    }
    if (opts.answers === 'round') deck.answers(`Respostas · ${r.title}`, r.items, color);
  }

  const guil = guilhotinaItem(qz);
  const guilColor = tint(GUILHOTINA.color);
  deck.section({ kicker: `Pergunta ${guil.n}`, title: 'Guilhotina', extra: 'Que palavra liga as quatro?', color: guilColor });
  await deck.question({ kick: 'Guilhotina', n: String(guil.n), color: guilColor, q: qz.guilhotina }, opts.notes);
  if (opts.answers === 'round') deck.answers('Resposta · Guilhotina', [guil], guilColor);

  if (opts.answers === 'end') {
    deck.section({ kicker: 'Fim do jogo', title: 'Respostas', color: madeiraColor });
    deck.answers('Resposta · Madeira', [madeiraItem], madeiraColor);
    rs.forEach(r => deck.answers(`Respostas · ${r.title}`, r.items, tint(r.color)));
    deck.answers('Resposta · Guilhotina', [guil], guilColor);
  }

  if (opts.answers !== 'none') {
    deck.section({ kicker: 'Desempate', title: 'Resposta da aproximação', color: approxColor });
    const p = deck.reveal(qz.approximation);
    if (opts.notes) p.s.addNotes(noteLines(qz.approximation).join('\n'));
  }
  return pptx;
}

async function exportPptx(qz) {
  const pptx = await buildPptx(qz);
  await pptx.writeFile({ fileName: `${baseFilename()}.pptx` });
}

async function exportAnswersPptx(qz) {
  const pptx = await buildAnswersPptx(qz);
  await pptx.writeFile({ fileName: `${baseFilename()}-respostas.pptx` });
}
