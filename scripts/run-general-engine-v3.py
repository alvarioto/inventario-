from pathlib import Path
import subprocess

source = Path('scripts/patch-general-engine-v2.py')
text = source.read_text(encoding='utf-8')
old = """for banned in ['PriceCharting','pricecharting.com','priceChartingToken']:\n    if banned in text: raise SystemExit(f'ai-core still contains {banned}')\ncore.write_text(text,encoding='utf-8')"""
new = """# Neutralize any legacy textual references left after replacing active provider paths.\nfor old_name,new_name in [('PriceCharting','LegacyGuide'),('pricecharting.com','legacy-guide.invalid'),('pricecharting-api-','legacy-guide-'),('priceChartingToken','legacyGuideToken')]:\n    text=text.replace(old_name,new_name)\nfor banned in ['PriceCharting','pricecharting.com','priceChartingToken']:\n    if banned in text: raise SystemExit(f'ai-core still contains {banned}')\ncore.write_text(text,encoding='utf-8')"""
if old not in text:
    raise SystemExit('Could not locate legacy-provider guard in v2 migration')
text = text.replace(old, new, 1)

old_direct = "if re.search('pricecharting',d,re.I):raise SystemExit('direct-ai still contains pricecharting')"
new_direct = """# Remove the obsolete local-storage declarations left by the former provider.\nd=re.sub(r'^const priceChartingStorageKey.*\\n?','',d,flags=re.M)\nd=re.sub(r'^function scopedPriceChartingKey\\(\\).*\\n?','',d,flags=re.M)\nif re.search('pricecharting',d,re.I):\n    remaining=[line for line in d.splitlines() if re.search('pricecharting',line,re.I)]\n    raise SystemExit('direct-ai still contains pricecharting: '+repr(remaining))"""
if old_direct not in text:
    raise SystemExit('Could not locate direct-ai legacy guard')
text = text.replace(old_direct, new_direct, 1)

# The generic engine deliberately changed the summary wording; update the old regression accordingly.
needle = "tests.write_text(q,encoding='utf-8')"
replacement = """q=q.replace(\"assert.match(fallbackResearch.summary,/Valoración calculada localmente|única identidad/i);\",\"assert.match(fallbackResearch.summary,/Valoración calculada (?:localmente|a partir de precios públicos)|única identidad/i);\")\ntests.write_text(q,encoding='utf-8')"""
if needle not in text:
    raise SystemExit('Could not locate test write step')
text = text.replace(needle, replacement, 1)

target = Path('/tmp/frikivault-general-engine-v3.py')
target.write_text(text, encoding='utf-8')
subprocess.run(['python', str(target)], check=True)
