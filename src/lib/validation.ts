/**
 * 管理画面フォームの入力検証結果を表す共通の型(タスク2-7: 管理画面仕上げ)。
 *
 * 各admin画面(performers/videos/shops/visits)は、この型を使って
 * バリデーション関数の戻り値を統一する。失敗時は分かりやすいエラーメッセージの
 * 配列(errors)を返し、呼び出し側は不足している項目をまとめて表示できる。
 * 実際のフィールドごとの検証ロジックは各画面のフォームによって異なるため、
 * このモジュールでは型のみを共有し、ロジックは各ページに留める。
 *
 * 例外として、複数画面(店舗管理フォーム/AI取り込みレビュー画面)で共通して使う
 * shops.instagramUrl のバリデーション(validateInstagramUrl、タスク6-2・P-020)と
 * shops.googlePlaceId のバリデーション(validatePlaceId、タスク6-3・P-021)は
 * ロジックの重複を避けるためこのモジュールに置く。
 */
export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

/**
 * shops.instagramUrl として許可するURLの接頭辞。
 * requirements.md「4. データモデル」shops.instagramUrl 参照
 * (https://www.instagram.com/ のURLのみ受け付ける、2026-09-25決定)。
 */
export const INSTAGRAM_URL_PREFIX = "https://www.instagram.com/";

/**
 * 店舗のInstagram URL入力値を検証する(タスク6-2・P-020)。
 * 前後の空白は除去する。空欄は「登録なし」として許可し、その場合は data: "" を返す
 * (Shop.instagramUrlは未設定・空文字のどちらも「登録なし」として扱う仕様のため)。
 * 入力がある場合は INSTAGRAM_URL_PREFIX から始まるURLのみ許可する。
 */
export function validateInstagramUrl(rawValue: string): ValidationResult<string> {
  const value = rawValue.trim();
  if (value === "") {
    return { ok: true, data: "" };
  }
  if (!value.startsWith(INSTAGRAM_URL_PREFIX)) {
    return {
      ok: false,
      errors: [`InstagramのURLは「${INSTAGRAM_URL_PREFIX}」から始まるURLのみ入力できます`],
    };
  }
  return { ok: true, data: value };
}

/**
 * shops.googlePlaceId として許可する文字種(英数字・ハイフン・アンダースコアのみ)。
 * requirements.md「4. データモデル」shops.googlePlaceId 参照(2026-09-25決定)。
 */
export const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 店舗のGoogle Place ID入力値を検証する(タスク6-3・P-021)。
 * 前後の空白は除去する。空欄は「登録なし」として許可し、その場合は data: "" を返す
 * (Shop.googlePlaceIdは未設定・空文字のどちらも「登録なし」として扱う仕様のため、
 * validateInstagramUrlと同じ方針)。入力がある場合は英数字・ハイフン・アンダースコアのみ許可する。
 */
export function validatePlaceId(rawValue: string): ValidationResult<string> {
  const value = rawValue.trim();
  if (value === "") {
    return { ok: true, data: "" };
  }
  if (!GOOGLE_PLACE_ID_PATTERN.test(value)) {
    return {
      ok: false,
      errors: ["Google Place IDは英数字・ハイフン・アンダースコアのみで入力してください"],
    };
  }
  return { ok: true, data: value };
}
