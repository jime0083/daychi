/**
 * Firebase App / Firestore / Auth の初期化モジュール。
 *
 * NEXT_PUBLIC_USE_EMULATOR=true のとき、Firestore/Auth Emulator Suite
 * (localhost)への接続に切り替える。切替ロジック自体は firebase-config.ts
 * (副作用なし)に分離しており、そちらでユニットテストする。
 */
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

import { getEmulatorConnectionConfig, resolveFirebaseOptions } from "./firebase-config";

// Next.jsのHot Module Reloadで本モジュールが再評価されてもEmulatorへの
// 二重接続(SDKが例外を投げる)を避けるため、プロセス全体で共有されるグローバルに
// 接続済みフラグを持たせる。
const globalForFirebase = globalThis as typeof globalThis & {
  __daychiFirebaseEmulatorConnected?: boolean;
};

function createFirebaseApp(): FirebaseApp {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }
  return initializeApp(resolveFirebaseOptions());
}

export const firebaseApp: FirebaseApp = createFirebaseApp();
export const db: Firestore = getFirestore(firebaseApp);
export const auth: Auth = getAuth(firebaseApp);

function connectEmulatorsIfNeeded(): void {
  if (globalForFirebase.__daychiFirebaseEmulatorConnected) {
    return;
  }

  const emulatorConfig = getEmulatorConnectionConfig();
  if (!emulatorConfig) {
    return;
  }

  connectFirestoreEmulator(db, emulatorConfig.firestore.host, emulatorConfig.firestore.port);
  connectAuthEmulator(auth, `http://${emulatorConfig.auth.host}:${emulatorConfig.auth.port}`, {
    disableWarnings: true,
  });
  globalForFirebase.__daychiFirebaseEmulatorConnected = true;
}

connectEmulatorsIfNeeded();
