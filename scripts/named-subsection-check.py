#!/usr/bin/env python3
"""
Проверка ИМЕНОВАННЫХ подсекций в правой панели конструктора
(«Заголовок», «Текст», «Кнопка», «Изображение», «Варианты», «Объявление» …).

  python3 scripts/named-subsection-check.py

Это второй класс подсекций, помимо элементов списков (см.
subsection-fields-check.py). Они объявлены в конструкторе —
`src/lib/utils/arrayField.ts` → NAMED_SUBSECTIONS, индекс = 100 + позиция —
и открываются кликом по заголовку/тексту/кнопке в превью. Скрипт читает эту
карту прямо из исходника конструктора и гоняет каждое подполе на живость.

Ловушки, дающие ЛОЖНЫЕ «мёртвые» (все три ловил на себе):
  • у object-поля надо заполнить СОСЕДНИЕ подполя: «Размер» на пустом заголовке
    и «Ссылка» на кнопке без текста не проявятся — кнопка просто не рендерится;
  • блоку нужна картинка в базовых пропсах, иначе он уходит в ветку заглушки;
  • для Product нужен товар С ВАРИАНТАМИ, иначе «Варианты» нечему менять.

И наоборот, ложное «живое» получается, если не воспроизвести defaultProps темы:
legacy-поле из дефолтов (button.href, textSize) может глушить видимое поле
панели — именно так нашлись два бага §11.
"""
import json, urllib.request, hashlib, copy, re, pathlib

SITES = {"satin": "57ac2ede-853d-42f3-abd5-68d6bbbc0709",
         "flux":  "4d8ebde5-c55c-4ea0-a11a-6cce08f71ffc",
         "bloom": "10df1c3a-a1fc-45e0-957a-511c131b1eb8"}
IMG_A = "http://localhost:9010/merfy-files/7abd7c1b-0172-4f8d-a94d-d40675e1f791.png"
IMG_B = "http://localhost:9010/merfy-files/3554497e-2578-4d65-bb3c-728e4ef2b04e.png"
# карта именованных подсекций — из исходника конструктора
def load_named_map():
    import re
    ts = pathlib.Path("/Users/alexey/projects/merfy/backend/services/constructor/src/lib/utils/arrayField.ts").read_text()
    body = ts[ts.index("export const NAMED_SUBSECTIONS"):]
    out = {}
    for m in re.finditer(r"\n  ([A-Z][A-Za-z0-9]*): \[", body):
        seg, depth, i = body[m.end():], 1, 0
        while i < len(seg) and depth:
            if seg[i] == "[": depth += 1
            elif seg[i] == "]": depth -= 1
            i += 1
        chunk = seg[:i]
        items = []
        for fm in re.finditer(r'field:\s*"([^"]+)"[\s\S]{0,200}?label:\s*"([^"]+)"', chunk):
            comp = re.search(rf'field:\s*"{re.escape(fm.group(1))}"[\s\S]{{0,300}}?compositeFields:\s*\[([^\]]*)\]', chunk)
            items.append({"field": fm.group(1), "label": fm.group(2),
                          "composite": re.findall(r'"([^"]+)"', comp.group(1)) if comp else []})
        out[m.group(1)] = items
    return out

NAMED = load_named_map()

def api(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    return urllib.request.urlopen(req, timeout=60).read().decode()

def render(site, block, props):
    try: return api(f"http://localhost:3114/api/sites/{site}/preview/block", {"blockType": block, "props": props})
    except Exception as e: return f"ERR {e}"

def h(s): return hashlib.md5(re.sub(r"\s+", " ", s).encode()).hexdigest()[:8]

def vals(t, f):
    if t in ("text", "aiText", "textarea"): return ["Альфа", "Бета"]
    if t == "image": return [IMG_A, IMG_B]
    if t in ("select", "radio"):
        o = [x.get("value") for x in (f.get("options") or []) if x.get("value") is not None]
        return [o[0], o[-1]] if len(o) >= 2 else None
    if t == "toggle": return [True, False]
    if t == "alignment": return ["left", "right"]
    if t == "colorScheme": return ["scheme-1", "scheme-4"]
    if t == "slider": return [f.get("min", 1), f.get("max", 6)]
    if t == "pagePicker": return ["/about", "/catalog"]
    return None

for theme, site in SITES.items():
    cfgs = json.loads(api(f"http://localhost:3200/api/themes/{theme}/puck-config"))
    B = cfgs.get("blocks") or cfgs.get("components") or cfgs
    try:
        sd = json.loads(api(f"http://localhost:3114/api/sites/{site}/storefront-data"))
        prods = sd.get("products") or []
        # для Product нужен товар С ВАРИАНТАМИ, иначе «Варианты» нечему менять
        pid = next((x.get("id") for x in prods if x.get("variantGroups") or x.get("variantCombinations")),
                   (prods[0].get("id") if prods else None))
    except Exception:
        pid = None
    print(f"\n{'═'*74}\n{theme.upper()}")
    for block, subs in NAMED.items():
        if not subs: continue
        cfg = B.get(block)
        if not cfg: print(f"  {block:16} блока нет в теме"); continue
        base = dict(cfg.get("defaultProps") or {}); base["id"] = "NS1"
        if block == "Product" and pid: base["productId"] = pid
        # тексты и тумблеры заполняем, иначе размеры мерить не на чем
        for fn, f in (cfg.get("fields") or {}).items():
            t = (f or {}).get("type")
            if t in ("text", "aiText", "textarea"): base.setdefault(fn, "Проверочный текст")
            elif t == "image": base.setdefault(fn, IMG_A)   # без картинки блок уходит в ветку заглушки
            elif t == "toggle": base.setdefault(fn, True)
        for sub in subs:
            targets = sub["composite"] or [sub["field"]]
            dead, checked = [], 0
            for fname in targets:
                fcfg = (cfg.get("fields") or {}).get(fname)
                if not fcfg: continue
                # объект → проверяем каждое подполе; иначе само поле
                leaves = ((fcfg.get("objectFields") or {}).items()
                          if fcfg.get("type") == "object" else [(fname, fcfg)])
                # ВАЖНО: у object-поля остальные подполя надо заполнить, иначе
                # «Размер» меряется на пустом заголовке, а «Ссылка» — на кнопке
                # без текста (она вообще не рендерится) → ложные «мёртвые».
                if fcfg.get("type") == "object":
                    seed = {}
                    for lk, lfc in (fcfg.get("objectFields") or {}).items():
                        sv = vals((lfc or {}).get("type"), lfc or {})
                        if sv: seed[lk] = sv[0]
                    cur0 = base.get(fname)
                    base[fname] = {**(cur0 if isinstance(cur0, dict) else {}), **seed}
                for leaf, lf in leaves:
                    t = (lf or {}).get("type")
                    if t in ("hidden", "section-header"): continue
                    v = vals(t, lf or {})
                    if not v: continue
                    pa, pb = copy.deepcopy(base), copy.deepcopy(base)
                    if fcfg.get("type") == "object":
                        # базовое значение бывает строкой (легаси-ревизия) — тогда
                        # начинаем объект с нуля, иначе dict-spread падает
                        cur = base.get(fname)
                        cur = cur if isinstance(cur, dict) else {}
                        pa[fname] = {**cur, leaf: v[0]}
                        pb[fname] = {**cur, leaf: v[1]}
                    else:
                        pa[fname], pb[fname] = v[0], v[1]
                    ra, rb = render(site, block, pa), render(site, block, pb)
                    if ra.startswith("ERR"): continue
                    checked += 1
                    if h(ra) == h(rb):
                        dead.append(f"{fname}.{leaf}" if fcfg.get("type") == "object" else fname)
            status = "все живые" if not dead else "МЁРТВЫЕ: " + ", ".join(dead)
            print(f"  {block:16} «{sub['label']:26}» полей {checked:2} → {status}")
