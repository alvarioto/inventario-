import { useState, useEffect } from 'react';
import {
  getPersonalKey, savePersonalKey, removePersonalKey, testDirect, syncPersonalKey,
  getPriceChartingToken, savePriceChartingToken, removePriceChartingToken, syncPriceChartingToken
} from '../lib/direct-ai';

export function DirectAiSettings() {
  const [key, setKey] = useState('');
  const [configured, setConfigured] = useState(() => Boolean(getPersonalKey()));
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [priceToken, setPriceToken] = useState('');
  const [priceConfigured, setPriceConfigured] = useState(() => Boolean(getPriceChartingToken()));
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceMessage, setPriceMessage] = useState('');

  useEffect(() => {
    const refresh = () => { setConfigured(Boolean(getPersonalKey())); setPriceConfigured(Boolean(getPriceChartingToken())); };
    window.addEventListener('frikivault-ai-ready', refresh);
    return () => window.removeEventListener('frikivault-ai-ready', refresh);
  }, []);

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

  async function savePriceCharting() {
    if (!priceToken.trim()) return;
    setPriceBusy(true); setPriceMessage('Guardando token de PriceCharting…');
    try {
      savePriceChartingToken(priceToken);
      await syncPriceChartingToken();
      setPriceToken('');
      setPriceConfigured(true);
      setPriceMessage('PriceCharting API configurada. La investigación usará PriceCharting como primera guía cuando encuentre el producto exacto.');
    } catch (e) { setPriceMessage(e instanceof Error ? e.message : 'No se pudo guardar el token.'); }
    finally { setPriceBusy(false); }
  }

  return <div className="panel provider-settings">
    <section className="settings-integration">
      <h3>IA directa · DeepSeek</h3>
      <p className="muted">Analiza fotos e investiga fuentes públicas. {configured ? 'Clave configurada; pulsa Comprobar conexión para verificarla.' : 'Añade tu clave personal para conectar.'}</p>
      <label className="field"><span>Clave personal</span><input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? 'Clave guardada; escribe aquí para cambiarla' : 'sk-…'}/></label>
      <p className="muted"><label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> Recordar en este dispositivo privado</label></p>
      <div className="button-stack">
        <button className="primary" disabled={busy || (!configured && !key.trim())} onClick={connect}>{busy ? 'Comprobando…' : key.trim() ? 'Guardar y comprobar' : 'Comprobar conexión'}</button>
        {configured && <button className="secondary" disabled={busy} onClick={async () => {try {await removePersonalKey(); setConfigured(false); setKey(''); setMessage('Clave eliminada de esta sesión y de los ajustes de tu cuenta.');} catch {setMessage('No se pudo eliminar la clave de tu cuenta.');}}}>Borrar clave</button>}
      </div>
      {message && <p className="muted" role="status">{message}</p>}
    </section>

    <section className="settings-integration pricecharting-settings">
      <h3>Guía de precios · PriceCharting <span className="provider-badge">Opcional</span></h3>
      <p className="muted">Añade el token oficial de 40 caracteres de una suscripción PriceCharting con acceso API. FrikiVault conserva PriceCharting solo como guía opcional para videojuegos, cartas, cómics y LEGO. Los Funko se investigan con hobbyDB/Pop Price Guide y se contrastan con eBay y StockX.</p>
      <label className="field"><span>Token PriceCharting</span><input type="password" autoComplete="off" spellCheck={false} value={priceToken} onChange={e => setPriceToken(e.target.value)} placeholder={priceConfigured ? 'Token guardado; escribe aquí para cambiarlo' : '40 caracteres'}/></label>
      <p className="muted">Se guarda en los ajustes privados de tu cuenta, igual que la clave de IA; no se incluye en GitHub ni en las exportaciones. hobbyDB puede exigir inicio de sesión, Premium o CAPTCHA para partes de su Price Guide; FrikiVault no intenta saltarse esas protecciones y usa eBay/StockX como respaldo automático.</p>
      <div className="button-stack">
        <button className="primary" disabled={priceBusy || !priceToken.trim()} onClick={savePriceCharting}>{priceBusy ? 'Guardando…' : priceConfigured ? 'Cambiar token' : 'Guardar token'}</button>
        {priceConfigured && <button className="secondary" disabled={priceBusy} onClick={async () => {try {await removePriceChartingToken(); setPriceConfigured(false); setPriceToken(''); setPriceMessage('Token de PriceCharting eliminado.');} catch {setPriceMessage('No se pudo eliminar el token.');}}}>Desconectar PriceCharting</button>}
      </div>
      {priceMessage && <p className="muted" role="status">{priceMessage}</p>}
      <a className="provider-doc-link" href="https://www.pricecharting.com/api-documentation" target="_blank" rel="noreferrer">Documentación oficial de PriceCharting API ↗</a>
    </section>
  </div>;
}
