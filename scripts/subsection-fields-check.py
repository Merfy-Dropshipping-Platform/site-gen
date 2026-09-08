#!/usr/bin/env python3
"""
Проверка настроек ПОДСЕКЦИЙ в правой панели конструктора
(ряд, колонка, слайд, пункт FAQ, элемент галереи, плитка коллекции).

  python3 scripts/subsection-fields-check.py

Зачем отдельно от section-contract-check.mjs: тот держит `array` в SKIP_TYPES,
то есть настройки ВНУТРИ элемента списка не проверялись никогда. Здесь для каждого
array-поля берутся ровно те контролы, что показывает панель элемента
(FocusedItemPanel рисует все arrayFields кроме id; hidden/section-header — не
контролы), и каждый меняется на два значения с проверкой, меняется ли рендер.

Ловушки, на которых легко получить ЛОЖНЫЕ «мёртвые» поля:
  • картинки — только РЕАЛЬНЫЕ (MinIO). Пути /placeholders/* и /images/4x/*
    порты трактуют как «не выбрано» (contentSet / slotImage);
  • Gallery — элемент это ОДИН из image/product/collection; productId надо
    проверять при type='product', иначе поле в рендер не попадает;
  • пикеры товара/коллекции требуют, чтобы у сайта были товары и коллекции
    (иначе поле честно помечается «не проверено», а не «мёртвое»);
  • Header.navigationLinks сюда не входит: пункты меню правятся модалкой,
    а не панелью элемента (маркер стоит на контейнере <nav>, индекс 997).
"""
import json, urllib.request, hashlib, copy, re

SITES = {"satin": "57ac2ede-853d-42f3-abd5-68d6bbbc0709",
         "flux":  "4d8ebde5-c55c-4ea0-a11a-6cce08f71ffc",
         "bloom": "10df1c3a-a1fc-45e0-957a-511c131b1eb8"}
IMG_A = "http://localhost:9010/merfy-files/7abd7c1b-0172-4f8d-a94d-d40675e1f791.png"
IMG_B = "http://localhost:9010/merfy-files/3554497e-2578-4d65-bb3c-728e4ef2b04e.png"
# hidden/section-header — не настройки мерчанта, панель их не показывает как контрол
NOT_A_CONTROL = {"hidden", "section-header", "disabledHint"}

def api(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
        headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    return urllib.request.urlopen(req, timeout=60).read().decode()

def render(site, block, props):
    try: return api(f"http://localhost:3114/api/sites/{site}/preview/block", {"blockType": block, "props": props})
    except Exception as e: return f"ERR {e}"

def h(s): return hashlib.md5(re.sub(r"\s+", " ", s).encode()).hexdigest()[:8]

def catalog(site):
    try:
        d = json.loads(api(f"http://localhost:3114/api/sites/{site}/storefront-data"))
    except Exception:
        return [], []
    return ([p.get("id") for p in (d.get("products") or []) if p.get("id")][:2],
            [c.get("id") for c in (d.get("collections") or []) if c.get("id")][:2])

def values(ftype, f, prods, colls):
    if ftype in ("text", "aiText", "textarea"): return ["Альфа", "Бета"]
    if ftype == "image": return [IMG_A, IMG_B]
    if ftype in ("select", "radio"):
        o = [x.get("value") for x in (f.get("options") or []) if x.get("value") is not None]
        return [o[0], o[-1]] if len(o) >= 2 else None
    if ftype == "toggle": return [True, False]
    if ftype == "alignment": return ["left", "right"]
    if ftype == "colorScheme": return ["scheme-1", "scheme-4"]
    if ftype == "slider": return [f.get("min", 1), f.get("max", 6)]
    if ftype == "productPicker": return prods if len(prods) >= 2 else None
    if ftype == "collectionPicker": return colls if len(colls) >= 2 else None
    if ftype == "pagePicker": return ["/about", "/catalog"]
    if ftype == "object":
        a, b = {}, {}
        for k, sub in (f.get("objectFields") or {}).items():
            v = values((sub or {}).get("type"), sub or {}, prods, colls)
            if v: a[k], b[k] = v[0], v[1]
        return [a, b] if a else None
    return None

for theme, site in SITES.items():
    prods, colls = catalog(site)
    cfgs = json.loads(api(f"http://localhost:3200/api/themes/{theme}/puck-config"))
    B = cfgs.get("blocks") or cfgs.get("components") or cfgs
    print(f"\n{'═'*72}\n{theme.upper()}   (товаров для пикера: {len(prods)}, коллекций: {len(colls)})")
    for block, cfg in B.items():
        for arrname, f in ((cfg or {}).get("fields") or {}).items():
            if not isinstance(f, dict) or f.get("type") != "array": continue
            if block == "Header": continue          # правится модалкой, не панелью элемента
            af = f.get("arrayFields") or {}
            controls = {k: v for k, v in af.items()
                        if k != "id" and (v or {}).get("type") not in NOT_A_CONTROL}
            # базовый элемент: все контролы в значении A
            item = {}
            for k, sf in controls.items():
                v = values((sf or {}).get("type"), sf or {}, prods, colls)
                if v: item[k] = v[0]
            props = dict(cfg.get("defaultProps") or {}); props["id"] = "SB1"
            props[arrname] = [copy.deepcopy(item)]
            dead, skipped = [], []
            for k, sf in controls.items():
                t = (sf or {}).get("type")
                v = values(t, sf or {}, prods, colls)
                if not v or v[0] == v[1]:
                    skipped.append(f"{k}[{t}]"); continue
                pa = copy.deepcopy(props); pa[arrname][0][k] = v[0]
                pb = copy.deepcopy(props); pb[arrname][0][k] = v[1]
                # Gallery: элемент — ОДИН из image/product/collection, и панель
                # показывает поля ТОЛЬКО выбранного типа. Проверять productId на
                # элементе типа «Изображение» бессмысленно — поле там не рендерится.
                if block == "Gallery":
                    kind = {"productId": "product", "collectionId": "collection",
                            "url": "image", "alt": "image"}.get(k)
                    if kind:
                        pa[arrname][0]["type"] = kind
                        pb[arrname][0]["type"] = kind
                ra, rb = render(site, block, pa), render(site, block, pb)
                if ra.startswith("ERR"): skipped.append(f"{k}[ошибка]"); continue
                if h(ra) == h(rb): dead.append(f"{k} «{(sf or {}).get('label') or t}»")
            total = len(controls)
            status = "все живые" if not dead else "МЁРТВЫЕ: " + "; ".join(dead)
            extra = f"  (не проверено: {', '.join(skipped)})" if skipped else ""
            print(f"  {block:20} контролов {total:2} → {status}{extra}")
