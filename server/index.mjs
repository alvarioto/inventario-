import express from 'express';
import dotenv from 'dotenv';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { identify,research } from './core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
dotenv.config({path:process.env.FRIKIVAULT_SECRET_FILE||resolve(root,'.env.server'),quiet:true});
const env=process.env,host=env.HOST||'127.0.0.1',port=Number(env.PORT||4173);
const local=host==='127.0.0.1'||host==='localhost'||host==='::1';
if(!local&&(!env.FIREBASE_PROJECT_ID||!env.OWNER_UID||!env.APP_ORIGIN)){console.error('Para exponer el servidor configura FIREBASE_PROJECT_ID, OWNER_UID y APP_ORIGIN (HTTPS).');process.exit(1)}
if(!local&&!env.APP_ORIGIN?.startsWith('https://')){console.error('APP_ORIGIN debe usar HTTPS en producción.');process.exit(1)}
if(!local)initializeApp({projectId:env.FIREBASE_PROJECT_ID});
const config={key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL||'deepseek-flash',braveKey:env.BRAVE_SEARCH_API_KEY,priceChartingToken:env.PRICECHARTING_API_TOKEN};
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');next()});
const session=randomBytes(32).toString('hex');
app.use('/api',(req,res,next)=>{
 res.setHeader('Cache-Control','no-store');
 const allowed=local?[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://localhost:5173','http://127.0.0.1:5173']:[env.APP_ORIGIN];
 if(req.headers.origin&&!allowed.includes(req.headers.origin))return res.status(403).json({error:'Origen no autorizado.'});
 if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-FrikiVault-Session');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS')return res.status(204).end();
 if(local&&!['127.0.0.1','localhost','[::1]'].some(h=>req.headers.host===h+':'+port||req.headers.host===h+':5173'))return res.status(403).json({error:'Host no autorizado.'});
 if(req.method==='GET'&&req.path==='/status')return res.json({deepseek:Boolean(config.key),model:config.model,webSearch:Boolean(config.key||config.braveKey),publicSearch:Boolean(config.key||config.braveKey),mode:local?'local':'firebase',session:local?session:undefined});
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
 if(!req.is('application/json'))return res.status(415).json({error:'Se requiere JSON.'});
 next();
});
app.use('/api',async(req,res,next)=>{
 if(local){if(req.headers['x-frikivault-session']!==session)return res.status(401).json({error:'Recarga la aplicación para iniciar la sesión local.'});req.owner='local';return next()}
 try{const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const user=await getAuth().verifyIdToken(token);if(user.uid!==env.OWNER_UID)return res.status(403).json({error:'Esta aplicación es privada.'});req.owner=user.uid;next()}catch{return res.status(401).json({error:'Inicia sesión para utilizar la IA.'})}
});
const calls=new Map();app.use('/api',(req,res,next)=>{const now=Date.now(),bucket=calls.get(req.owner)||{since:now,n:0};if(now-bucket.since>3600000){bucket.since=now;bucket.n=0}if(++bucket.n>30)return res.status(429).json({error:'Límite de 30 consultas por hora. Prueba más tarde.'});calls.set(req.owner,bucket);next()});
app.use('/api',express.json({limit:'15mb'}));
app.post('/api/identify',async(req,res,next)=>{try{const raw=Array.isArray(req.body?.images)?req.body.images:(req.body?.image?[req.body.image]:[]);const images=raw.slice(0,5);if(!images.length||images.some(image=>typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)))return res.status(400).json({error:'Usa entre 1 y 5 fotos JPEG, PNG o WebP válidas.'});res.json(await identify(images,config))}catch(e){next(e)}});
app.post('/api/research',async(req,res,next)=>{try{res.json(await research(req.body,config))}catch(e){next(e)}});
app.use('/api',(req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
app.use(express.static(resolve(root,'dist'),{setHeaders:(res,path)=>{if(path.endsWith('index.html')||path.endsWith('service-worker.js'))res.setHeader('Cache-Control','no-cache')}}));
app.get('/{*path}',(req,res)=>res.sendFile(resolve(root,'dist/index.html')));
app.use((error,req,res,next)=>{const validation=error.name==='ZodError';res.status(error.type==='entity.too.large'?413:validation?400:502).json({error:validation?'Datos incompletos: confirma el artículo exacto antes de investigar.':error.type==='entity.too.large'?'La foto es demasiado grande.':String(error.message||'No se pudo completar la consulta.').replace(/sk-[a-zA-Z0-9_-]+/g,'[clave oculta]')})});
app.listen(port,host,()=>console.log(`FrikiVault: http://${host}:${port} · IA ${config.key?'configurada':'pendiente'} · ${local?'acceso local':'acceso privado Firebase'}`));
