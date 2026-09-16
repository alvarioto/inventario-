from pathlib import Path

core_path = Path('src/lib/ai-core.mjs')
core = core_path.read_text()

bad = "   reasoning:{effort:'none'},\n"
if bad not in core:
    raise SystemExit("No se encontró reasoning:{effort:'none'} en deepseekWebSearch")
core = core.replace(bad, '', 1)
core_path.write_text(core)

tests_path = Path('tests/core.mjs')
tests = tests_path.read_text()
marker = "assert.match(currentCoreSource,/max_uses:3/);"
addition = "\nassert.doesNotMatch(currentCoreSource,/reasoning:\\{effort:'none'\\}/);"
if marker not in tests:
    raise SystemExit('No se encontró marcador max_uses:3')
if "doesNotMatch(currentCoreSource,/reasoning:" not in tests:
    tests = tests.replace(marker, marker + addition, 1)
tests_path.write_text(tests)

print('pricing request patch applied')
