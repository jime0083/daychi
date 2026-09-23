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
    "- 店名・住所候補・出演者名・飲食メニューは、すべて動画タイトル・概要欄・字幕に明記された内容のみを",
    "  抽出してください。あなたの一般知識や推測でこれらの情報を補完・作成することは禁止します。",
    "- addressCandidateには、概要欄・字幕・タイトルに明記された住所の文字列だけを入れてください。",
    "  住所が本文中に書かれていない場合は、店名やチェーン名などから住所を推測・補完せず、",
    "  必ずaddressCandidateをnullにしてください。実在しそうな住所であっても、本文に書かれていない",
    "  限り出力してはいけません。",
    "- 出演者名は、可能な限り「既知の出演者一覧」に含まれる表記に正規化してください。ただし本文に",
    "  登場しない出演者を新たに作り出さないでください。",
    "- 飲食メニューも、本文(概要欄・字幕)に記載があるものだけを抽出してください。記載がないメニューを",
    "  一般的なメニュー名などから推測して追加しないでください。",
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
