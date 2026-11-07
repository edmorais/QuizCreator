'use strict';

// ---------------------------------------------------------------------------
// Separador "Configurar": temas, perguntas especiais, tamanho e verificações
// ---------------------------------------------------------------------------

const CHECKS = [
  ['missing', 'Perguntas por preencher'],
  ['unverified', 'Respostas por verificar'],
  ['duplicates', 'Perguntas repetidas neste quiz'],
  ['reused', 'Perguntas já usadas noutros quizzes'],
  ['order', 'Regra de repetição de temas na ordem misturada'],
];

// Aplica uma mudança de estrutura com possibilidade de desfazer e avisa se o tamanho mudou.
function applyChange(label, mutate) {
  pushQuizUndo(label);
  const before = { per: quiz.perTheme, lost: countStarted(quiz) };
  if (mutate() === false) { quizUndo.pop(); renderUndoButton(); return; }
  fixQuiz(quiz);
  save();
  render();
  const lost = before.lost - countStarted(quiz);
  if (quiz.perTheme < before.per) {
    toast(`O limite de ${MAX_QUESTIONS} perguntas obrigou a passar para ${quiz.perTheme} por tema${lost > 0 ? ` (saíram ${lost} perguntas da grelha)` : ''}.`, { label: 'Desfazer', run: popQuizUndo });
  }
}

function countStarted(qz) { return qz.themes.reduce((s, t) => s + t.questions.filter(isStarted).length, 0); }

function bankCount(id) { return bank.filter(e => e.theme === id && !e.uses.length).length; }

function nextColor() {
  const used = new Set([...quiz.themes, ...quiz.parked, ...quiz.specials].map(t => t.color));
  return CUSTOM_COLORS.find(c => !used.has(c)) || CUSTOM_COLORS[quiz.themes.length % CUSTOM_COLORS.length];
}

function moveItem(list, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}

const cfgSection = (title, hint, ...body) => el('section', { class: 'cfg-section' },
  el('header', {}, el('h3', {}, title), hint ? el('p', { class: 'hint' }, hint) : null), ...body);

function iconButton(label, title, onclick, disabled) {
  return el('button', { type: 'button', class: 'icon', title, 'aria-label': title, onclick, ...(disabled ? { disabled: '' } : {}) }, label);
}

function renderConfig() {
  const box = $('#config-view');
  box.replaceChildren(
    configSummary(),
    cfgSection('Temas', `Até ${MAX_THEMES} temas. Os temas desligados guardam as perguntas que já tinham.`, themesTable(), parkedThemes(), addThemeForm()),
    cfgSection('Perguntas especiais', 'Ficam fora da grelha. Podem ser numeradas, como a da Madeira, ou lidas fora da contagem, como a aproximação.', specialsTable(), addExtraButton()),
    cfgSection('Tamanho e rondas', null, sizeControls()),
    cfgSection('Verificações', 'Avisos que aparecem no topo enquanto preparas o quiz. As regras de etiquetas também orientam o preenchimento automático.', checksList(), rulesTable(), addRuleButton()),
    cfgSection('Predefinição', 'Os quizzes novos começam com esta configuração (sem as perguntas).', defaultsButtons()),
  );
}

function configSummary() {
  const sp = enabledSpecials(quiz).length;
  return el('div', { class: 'cfg-summary' },
    el('strong', {}, `${quizTotal(quiz)} perguntas`),
    el('span', {}, ` · ${quiz.themes.length} ${quiz.themes.length === 1 ? 'tema' : 'temas'} × ${quiz.perTheme} = ${themedTotal(quiz)} temáticas + ${sp} ${sp === 1 ? 'especial' : 'especiais'} · máximo ${MAX_QUESTIONS}`),
  );
}

// --- Temas ------------------------------------------------------------------

function themesTable() {
  return el('div', { class: 'cfg-list' }, quiz.themes.map((theme, i) => el('div', { class: 'cfg-row' },
    el('input', {
      type: 'color', value: theme.color, title: 'Cor do tema', class: 'swatch',
      onchange: e => applyChange('mudar a cor do tema', () => { theme.color = e.target.value; }),
    }),
    el('input', {
      value: theme.name, class: 'grow', 'aria-label': 'Nome do tema',
      onchange: e => { const v = e.target.value.trim(); if (v) applyChange('mudar o nome do tema', () => { theme.name = v; }); else e.target.value = theme.name; },
    }),
    el('span', { class: 'muted cfg-meta' }, theme.custom ? 'personalizado' : `${bankCount(theme.id)} no banco`),
    iconButton('↑', 'Subir', () => applyChange('mudar a ordem dos temas', () => moveItem(quiz.themes, i, -1)), i === 0),
    iconButton('↓', 'Descer', () => applyChange('mudar a ordem dos temas', () => moveItem(quiz.themes, i, 1)), i === quiz.themes.length - 1),
    el('button', {
      type: 'button', class: 'danger', ...(quiz.themes.length < 2 ? { disabled: '' } : {}),
      // As regras do tema ficam guardadas e voltam a valer se o tema for ligado outra vez.
      onclick: () => applyChange(`desligar ${theme.name}`, () => { quiz.parked.push(...quiz.themes.splice(i, 1)); }),
    }, 'Desligar'),
  )));
}

function parkedThemes() {
  const off = [
    ...quiz.parked,
    ...CATALOG.filter(c => !quiz.themes.some(t => t.id === c.id) && !quiz.parked.some(t => t.id === c.id)),
  ];
  if (!off.length) return null;
  const full = quiz.themes.length >= MAX_THEMES;
  return el('div', { class: 'cfg-chips' }, el('span', { class: 'muted' }, 'Desligados:'), off.map(t => el('span', { class: 'cfg-chip', style: `--c:${t.color}` },
    el('button', {
      type: 'button', title: full ? `Já tens ${MAX_THEMES} temas` : 'Ligar este tema', ...(full ? { disabled: '' } : {}),
      onclick: () => applyChange(`ligar ${t.name}`, () => {
        const parked = quiz.parked.findIndex(p => p.id === t.id);
        quiz.themes.push(parked >= 0 ? quiz.parked.splice(parked, 1)[0] : newTheme(t, quiz.perTheme));
      }),
    }, `+ ${t.name}`),
    t.custom ? el('button', {
      type: 'button', class: 'danger', title: 'Apagar o tema e as suas perguntas',
      onclick: () => {
        const n = (t.questions || []).filter(isStarted).length;
        if (n && !confirm(`Apagar “${t.name}” e as ${n} perguntas que tem? (podes desfazer)`)) return;
        applyChange(`apagar ${t.name}`, () => { quiz.parked = quiz.parked.filter(p => p.id !== t.id); });
      },
    }, '×') : null,
  )));
}

function addThemeForm() {
  const input = el('input', { placeholder: 'Novo tema, ex. Gastronomia', class: 'grow', maxlength: '40' });
  const add = () => {
    const name = input.value.trim();
    if (!name) return;
    if (quiz.themes.length >= MAX_THEMES) { alert(`O quiz já tem ${MAX_THEMES} temas.`); return; }
    if (quizTotal(quiz) - quiz.themes.length * quiz.perTheme + (quiz.themes.length + 1) > MAX_QUESTIONS) { alert('Não cabe mais nenhum tema no limite de perguntas.'); return; }
    applyChange(`acrescentar ${name}`, () => {
      quiz.themes.push(newTheme({ id: `custom-${slugify(name)}-${uid().slice(0, 4)}`, name, color: nextColor(), custom: true }, quiz.perTheme));
    });
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return el('div', { class: 'cfg-row add' }, input, el('button', { type: 'button', onclick: add }, '+ Tema personalizado'));
}

// --- Perguntas especiais -------------------------------------------------------

function specialsTable() {
  return el('div', { class: 'cfg-list' }, quiz.specials.map((sp, i) => {
    const fixedName = sp.kind !== 'question';
    const bankId = specialBankId(sp);
    const count = bankCount(bankId);
    return el('div', { class: `cfg-row special${sp.enabled ? '' : ' off'}`, style: `--c:${sp.color}` },
      el('label', { class: 'check', title: 'Incluir no quiz' }, el('input', {
        type: 'checkbox', ...(sp.enabled ? { checked: '' } : {}),
        onchange: e => {
          if (e.target.checked && quizTotal(quiz) + 1 > MAX_QUESTIONS && quiz.perTheme === 1) { e.target.checked = false; alert('Não cabe no limite de perguntas.'); return; }
          applyChange(e.target.checked ? `ligar ${sp.name}` : `desligar ${sp.name}`, () => { sp.enabled = e.target.checked; });
        },
      })),
      el('input', { type: 'color', value: sp.color, class: 'swatch', title: 'Cor', onchange: e => applyChange('mudar a cor', () => { sp.color = e.target.value; }) }),
      fixedName
        ? el('span', { class: 'grow cfg-name' }, sp.name)
        : el('input', {
          value: sp.name, class: 'grow', 'aria-label': 'Nome da pergunta',
          title: sp.id === 'local' ? 'Nome do local (muda a categoria do banco)' : 'Nome da pergunta',
          onchange: e => { const v = e.target.value.trim(); if (v) applyChange('mudar o nome', () => { sp.name = v; }); else e.target.value = sp.name; },
        }),
      el('span', { class: 'muted cfg-meta' }, count ? `${count} no banco` : 'banco vazio'),
      el('select', {
        'aria-label': 'Posição', onchange: e => applyChange('mudar a posição', () => { sp.position = e.target.value; }),
      }, el('option', { value: 'start', ...(sp.position === 'start' ? { selected: '' } : {}) }, 'No início'), el('option', { value: 'end', ...(sp.position === 'end' ? { selected: '' } : {}) }, 'No fim')),
      el('label', { class: 'check' }, el('input', {
        type: 'checkbox', ...(sp.numbered ? { checked: '' } : {}),
        onchange: e => applyChange('mudar a numeração', () => { sp.numbered = e.target.checked; }),
      }), 'Numerada'),
      sp.kind === 'approx' ? el('label', { class: 'check', title: 'A resposta só aparece no fim, para desempatar' }, el('input', {
        type: 'checkbox', ...(sp.reveal ? { checked: '' } : {}),
        onchange: e => applyChange('mudar o desempate', () => { sp.reveal = e.target.checked; }),
      }), 'Desempate') : el('span'),
      iconButton('↑', 'Subir', () => applyChange('mudar a ordem das especiais', () => moveItem(quiz.specials, i, -1)), i === 0),
      iconButton('↓', 'Descer', () => applyChange('mudar a ordem das especiais', () => moveItem(quiz.specials, i, 1)), i === quiz.specials.length - 1),
      sp.id.startsWith('extra') ? el('button', {
        type: 'button', class: 'danger',
        onclick: () => {
          if (isStarted(sp.q) && !confirm(`Apagar “${sp.name}” e a pergunta que tem? (podes desfazer)`)) return;
          applyChange(`apagar ${sp.name}`, () => { quiz.specials.splice(i, 1); });
        },
      }, 'Apagar') : el('span'),
    );
  }));
}

function addExtraButton() {
  const extras = quiz.specials.filter(s => s.id.startsWith('extra')).length;
  const full = extras >= MAX_EXTRAS;
  return el('div', { class: 'cfg-row add' }, el('button', {
    type: 'button', ...(full ? { disabled: '' } : {}), title: full ? `No máximo ${MAX_EXTRAS}` : '',
    onclick: () => applyChange('acrescentar pergunta extra', () => { quiz.specials.push(newExtra(quiz)); }),
  }, '+ Pergunta extra'), el('span', { class: 'muted' }, 'Por exemplo, uma pergunta bónus. Cada nome é uma categoria do banco.'));
}

// --- Tamanho e rondas --------------------------------------------------------------

function sizeControls() {
  const max = maxPerTheme(quiz);
  const per = el('select', {
    onchange: e => {
      const next = Number(e.target.value);
      const lost = quiz.themes.flatMap(t => t.questions.slice(next)).filter(isStarted).length;
      if (lost && !confirm(`Reduzir apaga ${lost} ${lost === 1 ? 'pergunta' : 'perguntas'} das últimas linhas da grelha. Continuar? (podes desfazer)`)) { e.target.value = String(quiz.perTheme); return; }
      applyChange('mudar o tamanho do quiz', () => { quiz.perTheme = next; });
    },
  }, Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    return el('option', { value: String(n), ...(n === quiz.perTheme ? { selected: '' } : {}) }, `${n} por tema (${n * quiz.themes.length} temáticas, ${n * quiz.themes.length + enabledSpecials(quiz).length} no total)`);
  }));

  const mode = el('select', {
    onchange: e => applyChange('mudar o tipo de ordem', () => { quiz.presentation.mode = e.target.value; }),
  }, el('option', { value: 'themes', ...(quiz.presentation.mode === 'themes' ? { selected: '' } : {}) }, `Por tema (${quiz.themes.length} ${quiz.themes.length === 1 ? 'ronda' : 'rondas'})`),
  el('option', { value: 'mixed', ...(quiz.presentation.mode === 'mixed' ? { selected: '' } : {}) }, 'Misturada'));

  const roundsSel = el('select', { onchange: e => applyChange('mudar o número de rondas', () => { quiz.presentation.rounds = Number(e.target.value); }) });
  renderRoundsSelect(roundsSel);

  const n = quiz.themes.length;
  const spread = el('select', {
    ...(n < 2 ? { disabled: '' } : {}),
    onchange: e => applyChange('mudar a regra de repetição', () => {
      quiz.config.spread = Number(e.target.value);
      if (quiz.presentation.mode === 'mixed') quiz.presentation.order = mixedOrder(quiz);
    }),
  }, n < 2 ? el('option', {}, 'Só há um tema') : Array.from({ length: n - 1 }, (_, i) => {
    const w = i + 2;
    return el('option', { value: String(w), ...(w === spreadWindow(quiz) ? { selected: '' } : {}) },
      w === 2 ? 'Nunca o mesmo tema seguido' : `Sem repetir em ${w} seguidas${w === n ? ' (todos)' : ''}`);
  }));

  return el('div', { class: 'cfg-grid' },
    el('label', {}, 'Perguntas por tema', per),
    el('label', {}, 'Ordem', mode),
    el('label', { ...(quiz.presentation.mode === 'mixed' ? {} : { class: 'dim' }) }, 'Rondas (ordem misturada)', roundsSel),
    el('label', {}, 'Repetição de temas ao baralhar', spread),
  );
}

// --- Verificações -----------------------------------------------------------------

function checksList() {
  return el('div', { class: 'cfg-checks' }, CHECKS.map(([key, label]) => el('label', { class: 'check' }, el('input', {
    type: 'checkbox', ...(quiz.config.checks[key] ? { checked: '' } : {}),
    onchange: e => { quiz.config.checks[key] = e.target.checked; save(); render(); },
  }), label)));
}

function rulesTable() {
  const rules = quiz.config.rules;
  if (!rules.length) return el('p', { class: 'muted' }, 'Sem regras de etiquetas.');
  const update = (rule, patch) => { Object.assign(rule, patch); save(); render(); };
  return el('div', { class: 'cfg-list' }, rules.map((rule, i) => el('div', { class: 'cfg-row rule' },
    el('span', {}, 'Pelo menos'),
    el('input', { type: 'number', min: '1', max: String(quiz.perTheme), value: String(rule.min), class: 'num', onchange: e => update(rule, { min: Math.max(1, Number(e.target.value) || 1) }) }),
    el('span', {}, rule.min === 1 ? 'pergunta de' : 'perguntas de'),
    el('select', { onchange: e => update(rule, { theme: e.target.value }) },
      [...quiz.themes, ...quiz.parked.filter(t => t.id === rule.theme)].map(t => el('option', { value: t.id, ...(t.id === rule.theme ? { selected: '' } : {}) }, t.name + (quiz.themes.includes(t) ? '' : ' (desligado)')))),
    el('span', {}, 'com a etiqueta'),
    el('input', { value: rule.tag, class: 'tag-input', placeholder: 'ex. Porto', onchange: e => { const v = e.target.value.trim(); if (v) update(rule, { tag: v }); else e.target.value = rule.tag; } }),
    el('button', { type: 'button', class: 'danger', onclick: () => { rules.splice(i, 1); save(); render(); } }, 'Remover'),
  )));
}

function addRuleButton() {
  return el('div', { class: 'cfg-row add' }, el('button', {
    type: 'button',
    onclick: () => {
      quiz.config.rules.push({ id: uid().slice(0, 8), theme: quiz.themes[quiz.themes.length - 1].id, tag: 'Etiqueta', min: 1 });
      save();
      render();
    },
  }, '+ Regra de etiqueta'), el('span', { class: 'muted' }, 'As etiquetas marcam-se no editor de cada pergunta.'));
}

// --- Predefinição -------------------------------------------------------------------

const DEFAULTS_KEY = 'defaults';

function quizShape(qz) {
  return {
    perTheme: qz.perTheme,
    themes: qz.themes.map(({ id, name, color, custom }) => ({ id, name, color, custom })),
    specials: qz.specials.map(({ q, ...rest }) => rest),
    config: structuredClone(qz.config),
    presentation: { mode: qz.presentation.mode, rounds: qz.presentation.rounds, answers: qz.presentation.answers, notes: qz.presentation.notes, template: qz.presentation.template },
  };
}

// Quiz novo com a configuração guardada como predefinição (ou a de fábrica).
function quizFromDefaults() {
  const shape = loadPrefs()[DEFAULTS_KEY];
  if (!shape) return newQuiz();
  try {
    const { quiz: qz } = normalizeQuiz({
      version: VERSION, perTheme: shape.perTheme, config: shape.config, presentation: shape.presentation,
      themes: shape.themes, specials: shape.specials.map(s => ({ ...s, q: null })),
    });
    return qz;
  } catch (e) {
    console.warn('Predefinição inválida:', e);
    return newQuiz();
  }
}

function defaultsButtons() {
  const has = !!loadPrefs()[DEFAULTS_KEY];
  return el('div', { class: 'cfg-row add' },
    el('button', {
      type: 'button',
      onclick: () => { savePref(DEFAULTS_KEY, quizShape(quiz)); toast('Os quizzes novos vão começar com esta configuração.'); render(); },
    }, 'Usar como predefinição'),
    el('button', {
      type: 'button', ...(has ? {} : { disabled: '' }),
      onclick: () => { savePref(DEFAULTS_KEY, null); toast('Os quizzes novos voltam à configuração de fábrica.'); render(); },
    }, 'Repor a de fábrica'),
    el('span', { class: 'muted' }, has ? 'Há uma predefinição guardada neste browser.' : 'Neste momento usa-se a configuração de fábrica.'),
  );
}
