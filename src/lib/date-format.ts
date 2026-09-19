/**
 * 公開ページの詳細シート(タスク3-2)で使う日付表示の整形関数。
 *
 * requirements.md「3.1 公開ページ」の詳細シート仕様に基づき、動画公開日は
 * 「YYYY年M月D日」、住所・営業時間の情報基準日(shops.infoAsOf)は
 * 「※YYYY年M月D日現在」の形式で表示する。
 *
 * 既存の管理画面(src/app/admin/shops/page.tsx 等)にも同種の日付整形関数
 * (formatDateForDisplay、YYYY/M/D形式)が存在するが、表示フォーマットが異なる
 * (区切り文字・年月日表記の有無)ため、それらを流用/変更せずこのモジュールに
 * 独立した関数として定義する(タスク3-2の範囲外である管理画面の変更を避けるため)。
 */
import type { Timestamp } from "firebase/firestore";

/** TimestampをJSTの日付として「YYYY年M月D日」形式に整形する */
export function formatDateJa(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * shops.infoAsOf を「※YYYY年M月D日現在」形式に整形する
 * (住所・営業時間が情報基準日時点のものである旨を示す注記に使用)
 */
export function formatInfoAsOf(timestamp: Timestamp): string {
  return `※${formatDateJa(timestamp)}現在`;
}
