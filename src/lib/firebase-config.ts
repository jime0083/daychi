/**
 * Firebase Web SDKの構成値・Emulator接続設定を解決する純粋関数群。
 *
 * 副作用(initializeApp等の実行)は firebase.ts が担当し、
 * このモジュールは環境変数から設定値を組み立てるロジックのみを持つ
 * (副作用がないためユニットテストが容易)。
 */

export interface FirebaseWebConfig {
  apiKey: string | undefined;
  authDomain: string | undefined;
  projectId: string | undefined;
  storageBucket: string | undefined;
  messagingSenderId: string | undefined;
  appId: string | undefined;
}

export interface EmulatorHostConfig {
  host: string;
  port: number;
}

export interface EmulatorConnectionConfig {
  firestore: EmulatorHostConfig;
  auth: EmulatorHostConfig;
}

// Firebase Emulator Suiteの標準ポート(タスク1-3で作成するfirebase.jsonと整合させる)
export const FIRESTORE_EMULATOR_HOST = "localhost";
export const FIRESTORE_EMULATOR_PORT = 8080;
export const AUTH_EMULATOR_HOST = "localhost";
export const AUTH_EMULATOR_PORT = 9099;

// Emulator利用時、実プロジェクトの構成値(manual-work W1)が未設定でも
// initializeAppが失敗しないためのフォールバックprojectId
const DEMO_EMULATOR_PROJECT_ID = "demo-daychi-coffee-map";

/**
 * 環境変数からFirebase Web SDKの構成値を読み取る。
 * 未設定のキーはundefinedのまま返す(呼び出し側で判定する)。
 */
export function getFirebaseWebConfig(env: NodeJS.ProcessEnv = process.env): FirebaseWebConfig {
  return {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * NEXT_PUBLIC_USE_EMULATOR=true のときのみEmulatorモードとみなす。
 * それ以外(未設定・"false"・その他の値)は本番Firebaseへの接続として扱う。
 */
export function isEmulatorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEXT_PUBLIC_USE_EMULATOR === "true";
}

/**
 * initializeAppに渡す構成値を解決する。
 * EmulatorモードでprojectId未設定の場合はデモ用projectIdを補う
 * (実Firebaseプロジェクトの構成値が無くてもビルド・起動が壊れないようにするため)。
 */
export function resolveFirebaseOptions(env: NodeJS.ProcessEnv = process.env): FirebaseWebConfig {
  const config = getFirebaseWebConfig(env);
  if (isEmulatorEnabled(env) && !config.projectId) {
    return { ...config, projectId: DEMO_EMULATOR_PROJECT_ID };
  }
  return config;
}

/**
 * Emulatorへの接続先設定を返す。Emulatorモードでない場合はnull
 * (呼び出し側はnullの場合、本番Firebaseへの接続を維持しEmulator接続処理を行わない)。
 */
export function getEmulatorConnectionConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmulatorConnectionConfig | null {
  if (!isEmulatorEnabled(env)) {
    return null;
  }
  return {
    firestore: { host: FIRESTORE_EMULATOR_HOST, port: FIRESTORE_EMULATOR_PORT },
    auth: { host: AUTH_EMULATOR_HOST, port: AUTH_EMULATOR_PORT },
  };
}
