# Instruções para gerar perguntas da base

Os ficheiros de `banco/fontes/` (`<tema>-N.json`, `aproximacao.json`, `madeira.json`) dão origem a `banco/base.js`:

```
python tools/build_base.py
```

O script valida as perguntas e remove as repetidas e as quase repetidas (mesma resposta e texto muito parecido). Os ids são estáveis. Quando a app abre e encontra uma versão nova da base, junta ao banco só as perguntas novas, sem tocar nas que já existem.

Público: clientes de uma quiz night num bar madeirense em Portugal. Cultura geral, tom descontraído.
Língua: **português europeu** (acordo ortográfico de 1990). Nada de brasileirismos ("equipa", não "time"; "ecrã", não "tela"; "telemóvel", não "celular").

## Regras de qualidade (as mais importantes)

1. **Só factos de que tens a certeza.** Se tiveres dúvidas sobre uma resposta, não incluas a pergunta.
2. **Resposta única e inequívoca.** Evita perguntas com várias respostas aceitáveis ou com "rasteiras".
3. **Factos estáveis.** Nada de "atual", "recorde atual", "último vencedor", "presidente atual". Se o facto depender do tempo, fixa o ano na pergunta ("Em 2016, …").
4. **Respostas curtas** (um nome, um número, uma palavra ou poucas palavras).
5. **Variedade.** Cobre muitos subtemas, épocas e regiões. Não repitas perguntas nem faças várias sobre o mesmo facto. Mistura temas portugueses e internacionais.
6. **Dificuldade**: cerca de 35% fácil ("1"), 45% média ("2"), 20% difícil ("3"). Difícil = poucas equipas acertam, mas é justo.
7. **Tipos**: cerca de 75% de resposta aberta, 20% de escolha múltipla (4 opções plausíveis, só uma correta, posição da correta variada), 5% de correspondência (3 a 5 pares).
8. `notes`: uma curiosidade ou contexto curto (opcional, mas útil para o apresentador). Máx. ~200 caracteres.

## Formato

Cada ficheiro é um **array JSON** (UTF-8) de objetos. Campos:

```json
[
  { "type": "open", "question": "Em que ano caiu o Muro de Berlim?", "answer": "1989", "difficulty": "1", "notes": "Caiu a 9 de novembro." },
  { "type": "choice", "question": "Qual é o símbolo químico do tungsténio?", "options": ["Tu", "W", "Tg", "Ts"], "correct": 1, "difficulty": "2" },
  { "type": "match", "question": "Faz corresponder cada pintor ao seu país natal.", "pairs": [
      { "left": "Frida Kahlo", "right": "México" }, { "left": "Edvard Munch", "right": "Noruega" }, { "left": "Joan Miró", "right": "Espanha" } ], "difficulty": "1" }
]
```

- `type`: `"open"`, `"choice"` ou `"match"`.
- `open` → `answer` obrigatório.
- `choice` → `options` (4 textos) e `correct` (índice 0–3). Sem `answer`.
- `match` → `pairs` (3–5 pares, `left` → `right` certo). Sem `answer`.
- `difficulty`: `"1"`, `"2"` ou `"3"`.
- `notes`: opcional.
- `porto`: `true` apenas em perguntas sobre a cidade do Porto (só no tema Locais e Geografia).

### Aproximação (formato próprio)

```json
[ { "question": "Qual a altitude do Pico Ruivo, em metros?", "answer": "1862", "unit": "metros", "notes": "Ponto mais alto da Madeira." } ]
```

- `answer`: **só dígitos** (pode ter ponto decimal), sem separadores de milhares nem unidades.
- `unit`: a unidade ("metros", "km", "anos", "habitantes", …) ou "" se for uma contagem óbvia.
- A pergunta deve ter uma resposta numérica exata e conhecida, mas **bastante difícil**: quase ninguém deve saber o valor exato, para desempatar quem chega mais perto.
- **Nada de datas nem anos** (o script rejeita "Em que ano…"). Evita também números que se calculam de cabeça.
- Bons tipos: alturas, profundidades, distâncias, áreas, temperaturas, medidas oficiais, contagens pouco conhecidas.

### Guilhotina (formato próprio)

Ficheiros `guilhotina*.json`. Há quatro palavras e a resposta é a palavra que as liga (pergunta 50 do quiz).

```json
[ { "words": ["Mesa", "Rede", "Bola", "Raquete"], "answer": "Ténis", "difficulty": "1", "notes": "Ténis de mesa…" } ]
```

- `words`: exatamente 4 palavras, sem repetições.
- `answer`: uma só palavra (ou expressão curta) que se liga a cada uma das quatro, sem ambiguidade.
- `question`: opcional. Por omissão, a app usa "Que palavra liga estas quatro?".

## Validação

Depois de escrever cada ficheiro, valida-o:

```
python -c "import json,sys; d=json.load(open(sys.argv[1],encoding='utf-8')); print(len(d))" banco/fontes/FICHEIRO.json
```
