/**
 * 汎用的なカメラ形のアイコン(タスク6-2・P-020)。
 *
 * requirements.md「3.1 公開ページ」の詳細シート仕様にあるInstagramアイコンの表示に使う。
 * Instagram公式ロゴを模倣しない方針(2026-09-25決定)のため、外部アイコンパッケージを
 * 追加せず、汎用的なカメラの形をした自作のインラインSVGとして実装する。
 * リンク自体のアクセシブルな名前(aria-label="Instagram")は呼び出し側のaタグに付与し、
 * このアイコン自体は装飾目的のため aria-hidden にする。
 */
interface CameraIconProps {
  className?: string;
}

export function CameraIcon({ className }: CameraIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 6l1.2-2h5.6L16 6h3a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 5 6h3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
