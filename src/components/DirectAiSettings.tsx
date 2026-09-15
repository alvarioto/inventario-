import { useState, useEffect } from 'react';
import { getPersonalKey, savePersonalKey, removePersonalKey, testDirect, syncPersonalKey } from '../lib/direct-ai';

export function DirectAiSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(() => Boolean(getPersonalKey()));
  const [remember, setRemember] = useState(false);
  useEffect(() => { const refresh = () => setConfigured(Boolean(getPersonalKey())); window.addEventListener('frikivault-ai-ready', refresh); return () => window.removeEventListener('frikivault-ai-ready', refresh); }, []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function connect() {
    setBusy(true); setMessage('Comprobando DeepSeek…');
    try {
      if (key.trim()) { savePersonalKey(key, remember); setKey(''); }
      else if (remember && getPersonalKey()) savePersonalKey(getPersonalKey(), true);
      setConfigured(Boolean(getPersonalKey()));
      await testDirect();
      await syncPersonalKey();
      setMessage('Conexión comprobada y clave sincronizada con tu cuenta. Ya puedes usarla también desde el móvil.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo comprobar la conexión.'); }
    finally { setBusy(false); }
  }
  return <div className="panel">
    <h3>IA directa · DeepSeek</h3>
    <p className="muted">Analiza fotos desde este navegador sin arrancar un servidor. {configured ? 'Clave configurada; pulsa Comprobar conexión para verificarla.' : 'Añade tu clave personal para conectar.'}</p>
    <label className="field"><span>Clave personal</span><input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? 'Clave guardada; escribe aquí para cambiarla' : 'sk-…'}/></label>
    <p className="muted"><label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Recordar en este dispositivo privado</label></p>
    <p className="muted">La clave se sincroniza en los ajustes privados de tu cuenta para usarla también desde el móvil. Este navegador la conserva durante la sesión, o hasta que la borres si marcas Recordar. No se incluye en GitHub ni en las copias de la colección. Cada consulta consume saldo de DeepSeek.</p>
    <div className="button-stack">
      <button className="primary" disabled={busy || (!configured && !key.trim())} onClick={connect}>{busy ? 'Comprobando…' : key.trim() ? 'Guardar y comprobar' : 'Comprobar conexión'}</button>
      {configured && <button className="secondary" disabled={busy} onClick={async () => {try {await removePersonalKey(); setConfigured(false); setKey(''); setMessage('Clave eliminada de esta sesión y de los ajustes de tu cuenta.');} catch {setMessage('No se pudo eliminar la clave de tu cuenta. Comprueba la conexión.');}}}>Borrar clave</button>}
    </div>
    {message && <p className="muted" role="status">{message}</p>}
  </div>;
}
