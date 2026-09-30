from pathlib import Path

path = Path('src/lib/ai-core.mjs')
text = path.read_text(encoding='utf-8')

old = "Para FIGURAS, extrae manufacturer, line, scale, wave y exclusive siempre que estén visibles; no los pierdas aunque el título ya parezca suficiente."
new = (
    "Para FIGURAS, extrae manufacturer, line, scale, wave y exclusive siempre que estén visibles; "
    "no los pierdas aunque el título ya parezca suficiente. FIGURAS EN CAJA Y MULTIPACKS: antes de identificar por apariencia, "
    "lee literalmente el frontal. Si el embalaje nombra dos o más personajes, conserva TODOS esos nombres en title y character; "
    "nunca reduzcas un multipack a una sola figura. Conserva también el nombre de colección/edición impreso (por ejemplo Infinity Saga), "
    "las designaciones exactas del personaje/modelo (por ejemplo Mark LXXXV) y cualquier código de producto legible (por ejemplo F0192) en sku. "
    "Añade en tags cada personaje adicional y cada nombre de colección/edición claramente visible para que la búsqueda posterior pueda desambiguar la ficha exacta."
)

if old not in text:
    raise SystemExit('No se encontró el texto objetivo del prompt de figuras; no se modifica nada.')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Prompt de identificación de figuras/multipacks actualizado.')
