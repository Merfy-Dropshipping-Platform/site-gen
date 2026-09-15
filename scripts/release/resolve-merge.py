#!/usr/bin/env python3
"""Разводит конфликты мержа main в ветку волны.

Разводит ТОЛЬКО накопительные файлы, где обе стороны дописали своё:
  docs/theme-work/STATUS.md   — строки «Последнее обновление», наша первой
  docs/theme-work/WORKLOG.md  — записи журнала, наша последней
  .github/workflows/ci.yml    — шаги гардов, сохраняются оба
  conformance/inventory/satin.generated.json — берётся из main, потом перегенерация

Конфликт в любом другом файле — это код, руками. Скрипт на нём падает.
"""
import re, subprocess, sys

KEEP_OURS_FIRST = {'docs/theme-work/STATUS.md', '.github/workflows/ci.yml'}
KEEP_OURS_LAST  = {'docs/theme-work/WORKLOG.md'}
JSON_SCRIPTS    = {'package.json'}   # обе стороны добавили по скрипту гарда
FROM_MAIN       = {'conformance/inventory/satin.generated.json'}

out = subprocess.run(['git','diff','--name-only','--diff-filter=U'],
                     capture_output=True, text=True).stdout.split()
known = KEEP_OURS_FIRST | KEEP_OURS_LAST | FROM_MAIN | JSON_SCRIPTS
unknown = [f for f in out if f not in known]
if unknown:
    print('КОД В КОНФЛИКТЕ — руками:', *unknown, sep='\n  ')
    sys.exit(1)

pat = re.compile(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
for f in out:
    if f in FROM_MAIN:
        subprocess.run(['git','checkout','--theirs',f], check=True)
        print(f'{f}: взят из main (дальше перегенерация)')
        continue
    s = open(f).read()
    if f in JSON_SCRIPTS:
        def fixj(m):
            ours, theirs = m.group(1).rstrip('\n'), m.group(2).rstrip('\n')
            if not ours.rstrip().endswith(','):
                ours = ours.rstrip() + ','
            return ours + '\n' + theirs + '\n'
        new, n = pat.subn(fixj, s)
        import json as _json
        try:
            _json.loads(new)
        except Exception as e:
            print(f'{f}: после сведения это не JSON — руками ({e})'); sys.exit(1)
        open(f,'w').write(new)
        print(f'{f}: сведено {n} блок(ов), оба скрипта сохранены, JSON валиден')
        continue
    ours_first = f in KEEP_OURS_FIRST
    def fix(m):
        ours, theirs = m.group(1), m.group(2)
        a, b = (ours, theirs) if ours_first else (theirs, ours)
        return a.rstrip('\n') + '\n' + ('\n' if f.endswith('WORKLOG.md') else '') + b.strip('\n') + '\n'
    new, n = pat.subn(fix, s)
    left = len(re.findall(r'^(<<<<<<<|=======|>>>>>>>)', new, flags=re.M))
    if left:
        print(f'{f}: ОСТАЛИСЬ МАРКЕРЫ ({left}) — руками'); sys.exit(1)
    open(f,'w').write(new)
    print(f'{f}: сведено {n} блок(ов), обе стороны сохранены')
