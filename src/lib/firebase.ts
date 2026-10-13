import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  type Firestore
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

export const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' || !isFirebaseConfigured;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);

  auth = getAuth(app);
  // Las fotos se guardan comprimidas dentro del documento Firestore. Una caché
  // persistente del SDK intenta duplicar también esas mutaciones en el navegador
  // y puede agotar su cuota de Storage. La fuente de verdad sigue siendo Firestore
  // en la nube; usamos caché de memoria para no almacenar esas colas grandes.
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: memoryLocalCache()
  });
}

export { app, auth, db };
