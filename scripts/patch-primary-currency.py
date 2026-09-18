from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')
old = "<div><span>Valor principal</span><b>{research.asking.median == null ? '—' : money(research.asking.median)}</b></div>"
new = "<div><span>Valor principal</span><b>{research.asking.median == null ? '—' : money(displayedResearchValue(research, displayCurrency) ?? research.asking.median, displayedResearchValue(research, displayCurrency) != null ? displayCurrency : research.asking.currency || 'EUR')}</b></div>"
count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly 1 Valor principal block, found {count}')
path.write_text(text.replace(old, new), encoding='utf-8')
print('Patched Valor principal currency display')
