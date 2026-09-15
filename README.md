# FrikiVault

FrikiVault es un inventario personal para figuras, cómics, manga, cartas, videojuegos, Funko, LEGO y merchandising. La interfaz está pensada para móvil: fotografías una pieza, revisas la identificación, confirmas que es correcta y solo entonces lanzas la investigación de fuentes y precios.

## Arquitectura

- **Frontend:** React + Vite + Firebase Authentication + Cloud Firestore.
- **IA privada:** servidor Express separado. La clave de DeepSeek nunca entra en el bundle del navegador.
- **Investigación:** DeepSeek busca en Internet público y resume solo las fuentes encontradas; eBay se muestra separado entre anuncios y ventas cerradas.
- **QR:** cada objeto guardado tiene un identificador estable y una etiqueta QR que abre su ficha autenticada.
- **Spark:** las fotografías se comprimen y se guardan en Firestore; no se usan Cloud Functions ni Cloud Storage.

## Ramas y entornos

| Rama | Entorno | Uso |
|---|---|---|
| `develop` | Desarrollo | Trabajo diario y pruebas locales |
| `staging` | Preproducción | Validación antes de publicar |
| `main` | Producción | Versión estable |

La promoción recomendada es `develop` → `staging` → `main`. Los workflows de GitHub ejecutan compilación, comprobación de tipos y pruebas del servidor antes de aceptar una promoción.

## Arranque local

```bash
npm install
npm run build
npm start
```

Abre `http://127.0.0.1:4173`. Para usar DeepSeek, copia `.env.server.example` como `.env.server` y añade `DEEPSEEK_API_KEY`. En Windows puedes ejecutar `scripts/CONFIGURAR-SERVIDOR.ps1`.

La investigación usa la búsqueda web pública de DeepSeek para consultar eBay España, catálogos y páginas de producto. No inicia sesión en eBay ni necesita `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` o una cuenta de eBay. `BRAVE_SEARCH_API_KEY` es opcional y solo sirve como buscador auxiliar. Los anuncios se muestran como precios solicitados, nunca como ventas cerradas; la ficha conserva los enlaces para abrirlos y comprobarlos.

## Firebase

Copia `.env.example` como `.env.local` y completa la configuración de la app web. Después activa Authentication con Google, Firestore y Firebase AI Logic si quieres mantener también el identificador visual de Gemini. La investigación de precios usa el backend privado de DeepSeek.

```bash
npm run dev
```

## Publicación

Firebase Hosting es la dirección web que abrirás desde el móvil y permite instalar la PWA en la pantalla de inicio. Authentication identifica tu usuario y Firestore sincroniza la colección; el modo local sigue funcionando sin conexión. El servidor Express se publica en un VPS con HTTPS y se configura en `VITE_API_BASE_URL` porque la clave de DeepSeek no puede ir dentro del navegador. No subas `.env.server`, `.env.local`, claves, tokens ni credenciales al repositorio.

- `scripts/DESPLEGAR.ps1`: build y despliegue de frontend/reglas Firebase.
- `scripts/CREAR-REPO-GITHUB.ps1`: inicializa y sube el repositorio privado si se ejecuta desde un PC con GitHub CLI.
- `scripts/CONFIGURAR-SERVIDOR.ps1`: crea la configuración privada del backend.

## Límites y criterio de precios

La aplicación guarda la fecha de cada consulta y las URLs de las fuentes. Distingue precio original, anuncios disponibles y ventas cerradas. Si no hay datos verificables, lo indica y ofrece enlaces para revisar eBay manualmente. El valor de tu unidad depende de edición, estado, caja, idioma y gastos de envío.
