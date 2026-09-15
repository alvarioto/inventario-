import { loadEnv } from 'vite';
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'];
const missing = required.filter(key => !env[key]?.trim() || /^(TU_|YOUR_|REPLACE)/i.test(env[key]));
if (missing.length || env.VITE_DEMO_MODE === 'true' || env.VITE_APPCHECK_DEBUG === 'true') {
  console.error('No se puede publicar todavia:');
  for (const key of missing) console.error('Falta en .env.local: ' + key);
  if (env.VITE_DEMO_MODE === 'true') console.error('Cambia VITE_DEMO_MODE=false.');
  if (env.VITE_APPCHECK_DEBUG === 'true') console.error('Cambia VITE_APPCHECK_DEBUG=false.');
  console.error('Ejecuta CONFIGURAR-FIREBASE.cmd y completa los pasos de la consola.');
  process.exit(1);
}
console.log('Configuracion presente. El acceso real a Firebase y a la IA se comprobara al usarlos.');
