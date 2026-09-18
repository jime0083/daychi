/**
 * リポジトリのユニットテスト(src/repositories/*.test.ts)専用の共通ヘルパー。
 * テストファイル自体ではない(*.test.tsという命名ではないため、vitestのテスト
 * スイートとしては実行されない)。
 *
 * これらのテストはFirebase Emulator Suite の Firestore(localhost:8080)へ
 * 実際に接続してCRUDを検証する。事前に `npm run emulator` でエミュレータを
 * 起動してから `npm run test` を実行すること。
 * エミュレータが起動していない場合、各テストスイートは自動的にskipされる
 * (skipされた場合もコマンド自体は正常終了する)。
 */
import { FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT } from "@/lib/firebase-config";

/**
 * テストファイルの先頭、かつ他のモジュールをdynamic importするより前に呼び出すこと。
 *
 * "@/lib/firebase" はモジュール評価(import)時にEmulator接続要否を判定して
 * 副作用(initializeApp/connectFirestoreEmulator/getAuth)を実行するため、その判定より前に
 * 環境変数を設定しておく必要がある。ESMの静的importは常にファイル本体より先に
 * 評価される(hoistされる)ため、"@/repositories/*" や "@/lib/firebase" を
 * static importせず、この関数を呼んだ後に dynamic import(`await import(...)`)する。
 *
 * NEXT_PUBLIC_FIREBASE_API_KEYには、Firebase Auth SDKの初期化時フォーマット検証
 * (auth/invalid-api-key)を通すためだけのダミー値を設定する。Auth Emulatorへの接続後は
 * 実際に外部へリクエストされないため、値の実在性は問われない。
 */
export function enableFirestoreEmulatorEnv(): void {
  process.env.NEXT_PUBLIC_USE_EMULATOR = "true";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "test-emulator-dummy-api-key";
}

/**
 * Firestore Emulatorが起動しているかどうかを判定する。
 * 呼び出し側は結果に応じて `describe.skipIf(!available)` 等でテストをskipすること。
 */
export async function isFirestoreEmulatorAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    try {
      // Firestore Emulatorはルートパスへのリクエストにも(ステータスコードに関わらず)
      // 応答を返す。fetchが例外を投げずに完了すれば疎通しているとみなす。
      await fetch(`http://${FIRESTORE_EMULATOR_HOST}:${FIRESTORE_EMULATOR_PORT}/`, {
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/** テスト間・テスト実行間の衝突を避けるための一意なIDを生成する */
export function uniqueTestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
