/**
 * AI抽出プロンプトの共通組み立て(タスク4-3)。
 *
 * Gemini・Claude両アダプタが同じプロンプトを使うことで、抽出結果のスキーマだけでなく
 * 抽出方針そのものをプロバイダ間で揃える(将来Claudeに切り替えても挙動が大きく
 * 変わらないようにするため)。
 */
import type { ExtractionInput } from "./types";

/**
 * 動画の概要欄・字幕・出演者名一覧から、抽出してほしい内容(店名/住所候補/
 * 出演者ごとの飲食メニュー)をJSON形式で出力するよう指示するプロンプトを組み立てる。
 */
export function buildExtractionPrompt(input: ExtractionInput): string {
  const transcriptSection =
    input.transcript !== null ? input.transcript : "(字幕は取得できませんでした)";
  const performerListSection =
    input.knownPerformerNames.length > 0
      ? input.knownPerformerNames.join("、")
      : "(登録済みの出演者はいません)";

  return [
    "あなたはコーヒー店紹介YouTube動画の概要欄と字幕から、紹介された店舗情報を抽出するアシスタントです。",
    "以下の動画情報から、紹介されたコーヒー店ごとに「店名」「住所候補」「出演者ごとの飲食メニュー」を抽出し、",
    "指定されたJSON Schemaに厳密に従うJSONのみを出力してください(説明文やコードブロック記法は不要です)。",
    "",
    "# 抽出方針",
    "- 出演者名は、可能な限り「既知の出演者一覧」に含まれる表記に正規化してください。",
    "- 住所が概要欄・字幕から読み取れない場合、addressCandidateはnullにしてください(推測で埋めないこと)。",
    "- 店舗が紹介されていない場合、shopsは空配列にしてください。",
    "",
    "# 既知の出演者一覧",
    performerListSection,
    "",
    "# 動画タイトル",
    input.videoTitle,
    "",
    "# 概要欄",
    input.description,
    "",
    "# 字幕",
    transcriptSection,
  ].join("\n");
}
