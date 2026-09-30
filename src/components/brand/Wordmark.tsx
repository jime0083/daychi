/**
 * ロゴ「DayChi COFFEE MAP」のワードマーク(タスク7-2)。
 *
 * requirements.md 3.1.1・docs/design/phase7-ui-mock.html の「.wm」構造(配置・比率)を
 * SVG <text> で再現したコンポーネント。見た目・アニメーションの実装詳細はWordmark.module.css
 * のコメント参照。
 *
 * review FAIL 1回目(2026-10-01)で「縁取りの線が描かれる」という要件に対し、旧実装
 * (HTML文字を-webkit-text-strokeで太らせた層をclip-pathで左→右に矩形ワイプする)が
 * 「文字が描かれる」ようには見えず「太い黄色の塊が左右にワイプされる」だけに見える、
 * という指摘を受けた。そのため、実際の文字の輪郭(グリフのアウトライン)を
 * stroke-dasharray/stroke-dashoffsetでトレースする本物の「線が描かれる」アニメーションに
 * 変更した(SVGの<text>はstroke/stroke-dasharray/stroke-dashoffsetをグリフの実際の
 * アウトラインに沿って適用するため、単純な矩形マスクと異なり本当に文字の形に沿って
 * 描かれるように見える)。
 *
 * このコンポーネントはロゴの見た目のみを担う制御コンポーネントで、「いつ表示するか」
 * 「何秒後に消すか」「いつ描画アニメーションを再生するか」等はFirstView.tsx(呼び出し側)の
 * 責務とする。requirements.md「ロゴに『DayChi COFFEE MAP』のアクセシブルな名前」に対応するため、
 * ルート要素にrole="img" + aria-labelを付与する(見本と同じ構造)。
 */
import type { CSSProperties } from "react";

import styles from "./Wordmark.module.css";

/**
 * SVGの<text>に縁取りの描画長(--dash-length)・最終的な縁取りの太さ(--stroke-width-final)を
 * CSSカスタムプロパティとして渡すための型(CSSPropertiesの標準の型定義には無いため、
 * 呼び出し時にこの型へキャストする)
 */
type GlyphStyle = CSSProperties & {
  "--dash-length": number;
  "--stroke-width-final": number;
};

/** ロゴのアクセシブルな名前(requirements.md 3.1.1) */
export const WORDMARK_ACCESSIBLE_NAME = "DayChi COFFEE MAP";

interface WordmarkProps {
  /**
   * 縁取り→塗りの描画アニメーションを行うかどうか。
   * false(既定)の場合は最終状態(完全に描かれた状態)を即時表示する
   * (通常のロゴ表示・初回描画・prefers-reduced-motion時に使う)。
   */
  animate?: boolean;
  /** 呼び出し側でサイズ(font-size)等を指定するための追加class */
  className?: string;
}

/**
 * viewBox座標系: 1 unit = ワードマーク全体のfont-sizeの1/100(BASE=100)。
 * docs/design/phase7-ui-mock.html の .wm のem単位の値を100倍してx/y/font-size/
 * stroke-widthに転用している。
 *
 * 注意(実機確認で発覚した換算ミスの修正): 元CSSの `.small { top: 2.53em }` `.cof { left: -0.51em }`
 * `.map { left: 5.74em }` は、いずれも `.small`(font-size: .34em)と同じ要素に指定されている値
 * のため、CSSの仕様上これらの em は「その要素自身の(計算済みの)font-size」を基準に解決される
 * (=コンテナのfont-sizeではなく、.small自身の0.34em×コンテナ を基準とする)。そのため
 * コンテナ基準(BASE=100)のunitに変換するには、値をそのまま100倍するのではなく、さらに
 * .small自身のfont-size比率(0.34)を掛ける必要がある:
 * - top: 2.53em × 0.34 × 100 ≈ 86(いったんこれを574等とコンテナ基準で100倍してしまい、
 *   MAPが画面右外まではみ出す不具合になっていた。実機スクリーンショットで発見)
 * - COFFEEのleft: -0.51em × 0.34 × 100 ≈ -17
 * - MAPのleft: 5.74em × 0.34 × 100 ≈ 195
 * 一方 `.big { font-size: 1em }` はコンテナ自身と同じ比率(1.0)なので、
 * `.big { left:0; top:0 }` は変換不要(0のまま)。`.wm { width:3.14em; height:1.24em }` も
 * .wm自身がコンテナ(font-size比率1.0)なので、そのまま100倍でよい(width:314, height:124)。
 * stroke-widthは `.st .big { stroke:.19em }`(.bigの font-size=1.0 基準)→ 100×0.19=19、
 * `.st .sm { stroke:.5em }`(.smallの font-size=0.34 基準)→ 34×0.5=17(小数点以下四捨五入)。
 *
 * アニメーション設計(review FAIL 1回目・2回目対応。2026-10-01実機確認で発覚):
 * 縁取りの太さ(strokeWidth、19/17)をそのまま維持しながらstroke-dasharray/dashoffsetで
 * 描画アニメーションさせると、Chromiumの実描画では「かなり長い時間(1秒以上)何も見えず、
 * 最後に突然現れる」という現象が発生した(実機検証・isolate3.html等の最小再現で確認。
 * 原因はSVGテキストの輪郭に対する太いstroke+dasharrayの組み合わせに起因する描画上の癖と
 * 推測されるが、ブラウザの内部実装依存のため断定はしない)。一方、同条件でstroke-widthを
 * 細く(2px程度)すると、6文字の単語でも1.3秒のうち半分未満で滑らかに左から右へ
 * 「実際に線が引かれる」ように描画されることを確認した。
 * そのため描画アニメーションでは、まず細い線でアウトラインをトレースし(0〜1.3秒、
 * stroke-widthは細いまま)、トレース完了直後にstroke-widthを最終的な太さ(縁取りとして
 * 見本と同じ見た目になる太さ)へ素早く太らせる(1.3〜1.6秒)、という2段階にする。
 * dashoffsetが0(=完全にトレース済み)になってから太さを変えるため、
 * 「太いstroke+dasharray」の組み合わせが実際に画面に出る期間を作らない。
 */
const VIEWBOX_WIDTH = 314;
const VIEWBOX_HEIGHT = 124;

interface GlyphSpec {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  strokeWidth: number;
  /**
   * stroke-dasharray/描画開始時のstroke-dashoffsetに使う推定値(縁取りの線が描かれる
   * アニメーション用)。SVGの<text>はgetTotalLength()を持たず、グリフのアウトラインの
   * 実際の周長をJSで正確には測れないため、十分大きめに見積もった固定値を使う
   * (実際の周長以上であれば、アニメーション終了時=完全に描かれた状態は常に正しくなる。
   * 実際の周長との差は「描かれ終わるタイミングが指定時間より少し早まる」という見た目の
   * 差にしかならず、正しさには影響しない)。
   */
  dashLength: number;
  size: "big" | "small";
}

const GLYPHS: readonly GlyphSpec[] = [
  { text: "DayChi", x: 0, y: 0, fontSize: 100, strokeWidth: 19, dashLength: 2200, size: "big" },
  {
    text: "COFFEE",
    x: -17,
    y: 86,
    fontSize: 34,
    strokeWidth: 17,
    dashLength: 750,
    size: "small",
  },
  { text: "MAP", x: 195, y: 86, fontSize: 34, strokeWidth: 17, dashLength: 750, size: "small" },
];

export function Wordmark({ animate = false, className }: WordmarkProps) {
  const rootClassName = [styles.wm, animate ? styles.drawing : null, className ?? null]
    .filter((value): value is string => value !== null && value !== "")
    .join(" ");

  return (
    <span className={rootClassName} role="img" aria-label={WORDMARK_ACCESSIBLE_NAME}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className={styles.svg}
        aria-hidden="true"
        focusable="false"
      >
        <g>
          {GLYPHS.map((glyph) => (
            <text
              key={`stroke-${glyph.text}`}
              x={glyph.x}
              y={glyph.y}
              fontSize={glyph.fontSize}
              strokeDasharray={glyph.dashLength}
              dominantBaseline="hanging"
              textAnchor="start"
              className={`${styles.strokeText} ${glyph.size === "big" ? styles.big : styles.small}`}
              style={
                {
                  "--dash-length": glyph.dashLength,
                  "--stroke-width-final": glyph.strokeWidth,
                } as GlyphStyle
              }
            >
              {glyph.text}
            </text>
          ))}
        </g>
        <g>
          {GLYPHS.map((glyph) => (
            <text
              key={`fill-${glyph.text}`}
              x={glyph.x}
              y={glyph.y}
              fontSize={glyph.fontSize}
              dominantBaseline="hanging"
              textAnchor="start"
              className={`${styles.fillText} ${glyph.size === "big" ? styles.big : styles.small}`}
            >
              {glyph.text}
            </text>
          ))}
        </g>
      </svg>
    </span>
  );
}
