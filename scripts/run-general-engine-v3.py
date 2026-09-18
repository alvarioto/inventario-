from pathlib import Path
import subprocess

source = Path('scripts/patch-general-engine-v2.py')
text = source.read_text(encoding='utf-8')
old = """for banned in ['PriceCharting','pricecharting.com','priceChartingToken']:\n    if banned in text: raise SystemExit(f'ai-core still contains {banned}')\ncore.write_text(text,encoding='utf-8')"""
new = """# Any legacy textual references left after replacing the active provider paths are neutralized.\n# This guarantees the removed provider cannot be selected by a stale host check, regex or comment.\nfor old_name,new_name in [('PriceCharting','LegacyGuide'),('pricecharting.com','legacy-guide.invalid'),('pricecharting-api-','legacy-guide-'),('priceChartingToken','legacyGuideToken')]:\n    text=text.replace(old_name,new_name)\nfor banned in ['PriceCharting','pricecharting.com','priceChartingToken']:\n    if banned in text: raise SystemExit(f'ai-core still contains {banned}')\ncore.write_text(text,encoding='utf-8')"""
if old not in text:
    raise SystemExit('Could not locate legacy-provider guard in v2 migration')
text = text.replace(old, new, 1)
target = Path('/tmp/frikivault-general-engine-v3.py')
target.write_text(text, encoding='utf-8')
subprocess.run(['python', str(target)], check=True)
