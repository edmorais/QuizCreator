"""Valida as perguntas em banco/fontes/*.json e gera banco/base.js.

Uso:  python tools/build_base.py

- O tema vem do nome do ficheiro (historia-1.json -> historia; aproximacao.json -> approx).
- Perguntas inválidas são ignoradas e listadas.
- Perguntas repetidas (mesmo texto normalizado) ficam só uma vez.
- O id de cada pergunta é estável (deriva do tema + texto), por isso voltar a gerar
  a base não duplica perguntas no banco de quem já a importou.
"""

import collections
import hashlib
import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = ROOT / "banco" / "fontes"
OUTPUT = ROOT / "banco" / "base.js"

THEMES = {
    "aproximacao": "approx",
    "madeira": "madeira",
    "historia": "historia",
    "ciencias": "ciencias",
    "desporto": "desporto",
    "musica": "musica",
    "arte": "arte",
    "literatura": "literatura",
    "atualidade": "atualidade",
    "geografia": "geografia",
    "guilhotina": "guilhotina",
}
GUILHOTINA_WORDS = 4


def norm(text):
    text = unicodedata.normalize("NFD", str(text))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def validate(item, theme):
    """Devolve (pergunta normalizada, None) ou (None, motivo)."""
    if not isinstance(item, dict):
        return None, "não é um objeto"

    if theme == "guilhotina":
        # Quatro palavras e a palavra que as liga; o enunciado é opcional.
        words = [clean(w) for w in item.get("words") or []]
        answer = clean(item.get("answer"))
        if len(words) != GUILHOTINA_WORDS or any(not w for w in words):
            return None, f"são precisas {GUILHOTINA_WORDS} palavras"
        if len({w.lower() for w in words}) != len(words):
            return None, "palavras repetidas"
        if not answer:
            return None, "sem resposta"
        difficulty = str(item.get("difficulty", ""))
        return {"type": "guilhotina", "question": clean(item.get("question")), "words": words, "answer": answer,
                "notes": clean(item.get("notes")), "source": clean(item.get("source")),
                "difficulty": difficulty if difficulty in ("1", "2", "3") else "", "points": 1, "verified": False}, None

    question = clean(item.get("question"))
    if len(question) < 8:
        return None, "pergunta vazia ou curta"
    notes = clean(item.get("notes"))
    source = clean(item.get("source"))

    if theme == "approx":
        # Datas são más perguntas de desempate (muita gente sabe ou anda perto).
        if re.search(r"\bem que (ano|s[ée]culo|d[ée]cada)\b|\bh[áa] quantos anos\b", question, re.I) \
                or clean(item.get("unit")).lower() in ("ano", "anos"):
            return None, "aproximação sobre datas"
        answer = clean(item.get("answer")).replace(",", ".").replace(" ", "")
        if not re.fullmatch(r"-?\d+(\.\d+)?", answer):
            return None, f"resposta não numérica: {answer!r}"
        return {"question": question, "answer": answer, "unit": clean(item.get("unit")),
                "notes": notes, "source": source, "verified": False}, None

    kind = item.get("type", "open")
    out = {"type": kind, "question": question, "notes": notes, "source": source,
           "difficulty": str(item.get("difficulty", "")) if str(item.get("difficulty", "")) in ("1", "2", "3") else "",
           "points": 1, "verified": False}
    if item.get("porto") is True:
        out["porto"] = True

    if kind == "open":
        answer = clean(item.get("answer"))
        if not answer:
            return None, "sem resposta"
        out["answer"] = answer
    elif kind == "choice":
        options = [clean(o) for o in item.get("options") or []]
        correct = item.get("correct")
        if len(options) < 2 or any(not o for o in options):
            return None, "opções inválidas"
        if len({o.lower() for o in options}) != len(options):
            return None, "opções repetidas"
        if not isinstance(correct, int) or not 0 <= correct < len(options):
            return None, "índice da opção correta inválido"
        out.update(options=options, correct=correct, answer="")
    elif kind == "match":
        pairs = [{"left": clean(p.get("left")), "right": clean(p.get("right"))}
                 for p in item.get("pairs") or [] if isinstance(p, dict)]
        if not 2 <= len(pairs) <= 8 or any(not p["left"] or not p["right"] for p in pairs):
            return None, "pares inválidos"
        if len({p["right"].lower() for p in pairs}) != len(pairs):
            return None, "coluna B com repetidos"
        out.update(pairs=pairs, answer="")
    else:
        return None, f"tipo desconhecido: {kind!r}"
    return out, None


def main():
    files = sorted(SOURCES.glob("*.json"))
    if not files:
        sys.exit(f"Sem ficheiros em {SOURCES}")

    entries, seen, dup_list = [], {}, []
    rejected = collections.defaultdict(list)
    duplicates = collections.Counter()
    stats = collections.defaultdict(collections.Counter)

    for path in files:
        prefix = path.stem.split("-")[0]
        theme = THEMES.get(prefix)
        if not theme:
            print(f"! ignorado (tema desconhecido): {path.name}")
            continue
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"! JSON inválido em {path.name}: {e}")
            continue
        for i, item in enumerate(items):
            q, reason = validate(item, theme)
            if reason:
                rejected[path.name].append(f"#{i + 1}: {reason}")
                continue
            # A aproximação é um grupo à parte; nas correspondências os pares fazem parte da pergunta.
            text = " ".join(q["words"]) if theme == "guilhotina" else q["question"]
            key = (theme + "|" if theme in ("approx", "guilhotina") else "") + norm(text)
            if q.get("type") == "match":
                key += "|" + norm(" ".join(p["left"] for p in q["pairs"]))
            if key in seen:
                duplicates[theme] += 1
                dup_list.append(f"{seen[key]} / {path.name}: {q['question'][:90]}")
                continue
            seen[key] = path.name
            entry_id = "base-" + hashlib.sha1(f"{theme}|{key}".encode()).hexdigest()[:12]
            q["id"] = entry_id
            entries.append({"id": entry_id, "theme": theme, "origin": "base", "q": q})
            stats[theme]["total"] += 1
            stats[theme][q.get("type", "approx")] += 1
            if q.get("difficulty"):
                stats[theme]["dif" + q["difficulty"]] += 1
            if q.get("porto"):
                stats[theme]["porto"] += 1

    # Quase repetidas: o mesmo facto com outra redação (muitas vezes em temas diferentes).
    # Critério: mesma resposta e texto muito parecido. Fica a primeira.
    def answer_key(q):
        if q.get("type") == "choice":
            return norm(q["options"][q["correct"]])
        return norm(q.get("answer", "")) if q.get("type") == "open" else ""

    def words(s):
        return {w for w in norm(s).split() if len(w) > 2}

    by_answer = collections.defaultdict(list)
    for e in entries:
        key = answer_key(e["q"])
        if e["theme"] != "approx" and key:
            by_answer[key].append(e)
    dropped, near_list = set(), []
    for key, group in by_answer.items():
        # Respostas numéricas coincidem muitas vezes por acaso: exige textos mais parecidos.
        limit = 0.8 if key.isdigit() else 0.6
        for i, a in enumerate(group):
            if a["id"] in dropped:
                continue
            wa = words(a["q"]["question"])
            for b in group[i + 1:]:
                wb = words(b["q"]["question"])
                if b["id"] not in dropped and wa and wb and len(wa & wb) / len(wa | wb) >= limit:
                    dropped.add(b["id"])
                    near_list.append(f"[{a['theme']}] {a['q']['question'][:70]}  ≈  [{b['theme']}] {b['q']['question'][:70]}")
    for e in entries:
        if e["id"] in dropped:
            stats[e["theme"]]["total"] -= 1
    entries = [e for e in entries if e["id"] not in dropped]

    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    version = hashlib.sha1(payload.encode()).hexdigest()[:10]
    OUTPUT.write_text(
        "// Gerado por tools/build_base.py — não editar à mão.\n"
        f"window.QUIZ_BASE = {{\"version\":\"{version}\",\"entries\":{payload}}};\n",
        encoding="utf-8",
    )

    print(f"{len(entries)} perguntas -> {OUTPUT.relative_to(ROOT)} (versão {version}, {OUTPUT.stat().st_size // 1024} KB)")
    for theme, c in sorted(stats.items()):
        detail = ", ".join(f"{k}={v}" for k, v in sorted(c.items()) if k != "total")
        print(f"  {theme:<11} {c['total']:>4}  ({detail})")
    if duplicates:
        print("Duplicados removidos:", dict(duplicates))
        for d in dup_list:
            print("   ", d)
    if near_list:
        print(f"Quase repetidas removidas: {len(near_list)}")
        for d in near_list:
            print("   ", d)
    for name, reasons in rejected.items():
        print(f"Rejeitadas em {name}: {len(reasons)}")
        for r in reasons[:10]:
            print("   ", r)


if __name__ == "__main__":
    main()
