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

// Emulator利用時、実プロジェクトのAPIキー(manual-work W1)が未設定でも
// getAuth()が "auth/invalid-api-key" で失敗しないためのフォールバック値。
// Auth EmulatorはAPIキーの実在性を検証しないため、値そのものに意味はない
// (フォーマットが空文字列でないことだけがクライアントSDK側でチェックされる)。
const DEMO_EMULATOR_API_KEY = "demo-emulator-api-key";

/**
 * このモジュールの各関数はテスト容易性のため env を引数で受け取れるようにしているが、
 * 省略時(env未指定)の実装は「process.env自体を変数に束縛してから動的に
 * プロパティアクセスする」形にしてはならない。理由は2つある:
 *
 * 1. クライアントバンドルでの静的置換: Next.js(Turbopack/webpack)は
 *    ソースコード中に直接書かれた `process.env.NEXT_PUBLIC_FOO` というメンバー式を
 *    ビルド時にリテラル値へ置換する(ブラウザには実際のprocess.envが存在しないため)。
 *    `env.NEXT_PUBLIC_FOO`(envはprocess.envを指す変数)のような間接参照は
 *    この静的解析で検出されず、常にundefinedのままになる。
 * 2. Node.js側での実行時ミューテーション追随: vitest/PlaywrightのE2Eテストは
 *    「process.env.NEXT_PUBLIC_USE_EMULATOR = "true" を実行してからこのモジュールを
 *    (再)importする」のではなく、他モジュール経由で本モジュールが先に一度
 *    importされていることがある(例: test-support.tsがこのモジュールを静的import
 *    している)。ESMの重複importはキャッシュされ再評価されないため、
 *    モジュール読み込み時に一度だけ計算する「スナップショット」方式だと、
 *    その後のprocess.envミューテーションが反映されない。
 *
 * そのため、env省略時は毎回の呼び出し時点で `process.env.NEXT_PUBLIC_FOO` を
 * 直接(関数本体に書かれたリテラルなメンバー式として)読み取る。これにより
 * Next.jsの静的置換(1)と、呼び出し時点の最新のprocess.env反映(2)を両立する。
 */
function readEnv(): NodeJS.ProcessEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_USE_EMULATOR: process.env.NEXT_PUBLIC_USE_EMULATOR,
  } as unknown as NodeJS.ProcessEnv;
}

/**
 * 環境変数からFirebase Web SDKの構成値を読み取る。
 * 未設定のキーはundefinedのまま返す(呼び出し側で判定する)。
 * env省略時は呼び出し時点の process.env を直接読み取る(readEnv()参照)。
 */
export function getFirebaseWebConfig(env?: NodeJS.ProcessEnv): FirebaseWebConfig {
  const source = env ?? readEnv();
  return {
    apiKey: source.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: source.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: source.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: source.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: source.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: source.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/**
 * NEXT_PUBLIC_USE_EMULATOR=true のときのみEmulatorモードとみなす。
 * それ以外(未設定・"false"・その他の値)は本番Firebaseへの接続として扱う。
 */
export function isEmulatorEnabled(env?: NodeJS.ProcessEnv): boolean {
  const source = env ?? readEnv();
  return source.NEXT_PUBLIC_USE_EMULATOR === "true";
}

/**
 * initializeAppに渡す構成値を解決する。
 * EmulatorモードでprojectId/apiKeyが未設定の場合はデモ用の値を補う
 * (実Firebaseプロジェクトの構成値が無くてもビルド・起動・Auth Emulatorへの
 * 接続(getAuth()の初期化)が壊れないようにするため)。
 */
export function resolveFirebaseOptions(env?: NodeJS.ProcessEnv): FirebaseWebConfig {
  const config = getFirebaseWebConfig(env);
  if (!isEmulatorEnabled(env)) {
    return config;
  }
  return {
    ...config,
    projectId: config.projectId ?? DEMO_EMULATOR_PROJECT_ID,
    apiKey: config.apiKey ?? DEMO_EMULATOR_API_KEY,
  };
}

/**
 * Emulatorへの接続先設定を返す。Emulatorモードでない場合はnull
 * (呼び出し側はnullの場合、本番Firebaseへの接続を維持しEmulator接続処理を行わない)。
 */
export function getEmulatorConnectionConfig(
  env?: NodeJS.ProcessEnv,
): EmulatorConnectionConfig | null {
  if (!isEmulatorEnabled(env)) {
    return null;
  }
  return {
    firestore: { host: FIRESTORE_EMULATOR_HOST, port: FIRESTORE_EMULATOR_PORT },
    auth: { host: AUTH_EMULATOR_HOST, port: AUTH_EMULATOR_PORT },
  };
}
