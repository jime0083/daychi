/**
 * サーバー側(Route Handler)でFirebase ID Tokenが管理者(admin カスタムクレーム
 * 保持者)によるものかを検証するユーティリティ(タスク2-7: /api/admin/oembed への認可)。
 *
 * 設計判断(firebase-admin不使用): firebase-adminをNext.jsサーバーに導入すると、
 * Application Default Credentials(ADC)の解決がサンドボックス環境でハングする
 * 既知の問題がある(problem.txt P-003関連)。そのため本モジュールはAdmin SDKを使わず、
 * Firebase Authが公開しているIdentity Toolkit REST API の `accounts:lookup`
 * (https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup)
 * にID Tokenを渡してユーザー情報(customAttributes = カスタムクレームのJSON文字列)を
 * 取得し、admin クレームの有無を判定する。
 *
 * このREST APIはFirebase Auth Emulatorも同一パス構成でエミュレートしているため
 * (host/portをEmulator向けに差し替えるだけでよい)、emulator環境で完結する検証が可能。
 * 本番相当の検証にはWeb APIキー(NEXT_PUBLIC_FIREBASE_API_KEY。秘密情報ではなく
 * クライアントにも配布される値)のみが必要で、サービスアカウントキーは不要。
 *
 * 実際のID Token署名検証(JWT検証)はこのREST API呼び出しの中でFirebase Auth側が
 * 行っている(不正な署名・失効したトークンは accounts:lookup がエラーを返す)ため、
 * このモジュール側で改めてJWTの署名検証を実装する必要はない。
 */
import {
  AUTH_EMULATOR_HOST,
  AUTH_EMULATOR_PORT,
  getFirebaseWebConfig,
  isEmulatorEnabled,
} from "@/lib/firebase-config";

// Auth EmulatorはAPIキーの実在性を検証しないため、値そのものに意味はない
// (e2e/support/emulator-auth.ts が accounts:signUp で使っているのと同じ考え方)
const EMULATOR_FALLBACK_API_KEY = "demo-emulator-api-key";

interface IdentityToolkitLookupUser {
  customAttributes?: string;
}

interface IdentityToolkitLookupResponse {
  users?: IdentityToolkitLookupUser[];
}

/** `Authorization: Bearer <idToken>` ヘッダーからID Token本体を取り出す。形式不一致ならnull */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

function resolveLookupEndpoint(): string {
  if (isEmulatorEnabled()) {
    return `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/identitytoolkit.googleapis.com/v1/accounts:lookup`;
  }
  return "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
}

function resolveApiKey(): string | null {
  const config = getFirebaseWebConfig();
  if (config.apiKey) {
    return config.apiKey;
  }
  return isEmulatorEnabled() ? EMULATOR_FALLBACK_API_KEY : null;
}

/**
 * ID Tokenを検証し、admin カスタムクレーム(admin === true)を持つ有効なユーザーの
 * トークンであれば true を返す。トークン不正・失効・クレーム無し・通信エラーなど、
 * 判定できない場合はすべて安全側(false = 非管理者)に倒す。
 */
export async function verifyAdminIdToken(idToken: string): Promise<boolean> {
  if (idToken.trim() === "") {
    return false;
  }

  const apiKey = resolveApiKey();
  if (apiKey === null) {
    return false;
  }

  const endpoint = `${resolveLookupEndpoint()}?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  let data: IdentityToolkitLookupResponse;
  try {
    data = (await response.json()) as IdentityToolkitLookupResponse;
  } catch {
    return false;
  }

  const user = data.users?.[0];
  if (user === undefined || typeof user.customAttributes !== "string") {
    return false;
  }

  try {
    const claims = JSON.parse(user.customAttributes) as Record<string, unknown>;
    return claims.admin === true;
  } catch {
    return false;
  }
}
