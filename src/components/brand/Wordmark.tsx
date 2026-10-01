/**
 * ロゴ「DayChi COFFEE MAP」のワードマーク(タスク7-2、タスク8-1で手書きアニメーションを刷新)。
 *
 * requirements.md 3.1.1・docs/design/phase7-ui-mock.html の「.wm」構造(配置・比率)を
 * SVG <text> で再現したコンポーネント。見た目・アニメーションの実装詳細はWordmark.module.css
 * のコメント参照。
 *
 * タスク8-1での変更(review FAILの経緯は7-2時点のコメントを参照。それに加えて今回):
 * - 旧実装は「単語(DayChi/COFFEE/MAP)単位」で縁取りの輪郭をトレースしていたが、
 *   requirements.md 3.1.1(2026-10-01変更)により「1文字ずつ順番に書いていく
 *   (D→a→y→C→h→i→C→O→F→F→E→E→M→A→P)」が要件になったため、各単語の<text>内に
 *   1文字ごとの<tspan>を用意し、文字ごとに独立したdasharray/dashoffset(縁取りのトレース)・
 *   opacity(塗りのフェードイン)アニメーションを時間差(--char-delay)で発火させる構成に変更した。
 *   <tspan>にx/yを指定しない(自然な行送りに任せる)ことで、1本の<text>として描画した場合と
 *   同じカーニング・字間(letter-spacing含む)を保ったまま、文字単位での制御が可能になる
 *   (SVGの仕様上、座標を指定しない<tspan>は直前の文字列の続きとして同じテキストレイアウトの
 *   流れに乗る)。
 * - 縁取りの太さ(stroke-width)・トレースの長さの見積り(stroke-dasharray)は文字ごとの
 *   個体差を問わない「サイズ階層(big/small)ごとの安全な固定値」としてCSS側
 *   (Wordmark.module.css)に持たせ、このコンポーネントは文字ごとの開始時刻(--char-delay)
 *   だけをJSで算出して渡す(文字の内容によらず一律の値で成立する設計のため)。
 *
 * このコンポーネントはロゴの見た目のみを担う制御コンポーネントで、「いつ表示するか」
 * 「何秒後に消すか」「いつ描画アニメーションを再生するか」等はFirstView.tsx(呼び出し側)の
 * 責務とする。requirements.md「ロゴに『DayChi COFFEE MAP』のアクセシブルな名前」に対応するため、
 * ルート要素にrole="img" + aria-labelを付与する(見本と同じ構造)。
 */
import type { CSSProperties } from "react";

import styles from "./Wordmark.module.css";

/** SVGの<tspan>に文字ごとの描画開始時刻(--char-delay)を渡すための型 */
type CharStyle = CSSProperties & {
  "--char-delay": string;
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
  /**
   * falseの場合、ロゴ自体を完全に非表示にする(既定: true)。
   *
   * タスク8-1 review FAIL対応: FirstView側で「アニメーション開始の判断
   * (動きを減らす設定か・フォント読み込み済みか)が終わるまでの間」にこのpropをfalseにして
   * 使うことで、「完成形のロゴが一瞬見えてから描画し直される」フラッシュを防ぐ
   * (判断が終わってvisible=trueになるのと同時にanimateの値も確定させるため、
   * 利用者の目には完成形が一度も映らずに描画アニメーションだけが見える)。
   */
  visible?: boolean;
  /** 呼び出し側でサイズ(font-size)等を指定するための追加class */
  className?: string;
}

/**
 * viewBox座標系: 1 unit = ワードマーク全体のfont-sizeの1/100(BASE=100)。
 * docs/design/phase7-ui-mock.html の .wm のem単位の値を100倍してx/y/font-size/
 * stroke-widthに転用している(詳細な換算根拠はWordmark.module.cssのコメント・
 * タスク7-2時点のgit履歴を参照)。
 */
const VIEWBOX_WIDTH = 314;
const VIEWBOX_HEIGHT = 124;

/**
 * 1文字ごとの描画アニメーションの開始時刻をずらす間隔(ms)。
 * requirements.md「書き終わるまで約2.3秒」に対応する値(タスク8-1)。
 * 全15文字(DayChi=6+COFFEE=6+MAP=3)に対し、最後の文字(index=14)の開始時刻は
 * 14 × 150ms = 2100ms。1文字の描画アニメーション総時間(Wordmark.module.cssの
 * wordmarkStrokeDraw 140ms + wordmarkFillIn 80ms = 220ms)を加えると2100+220=2320ms
 * ≒ 2.3秒で全文字の描画が完了する。隣接文字の開始時刻の差(150ms)は1文字の総時間(220ms)
 * より短いため、前の文字の描画が終わる直前に次の文字が始まる(要件「多少の重なりは可」)。
 */
const CHAR_STAGGER_MS = 150;

interface WordSpec {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  size: "big" | "small";
}

const WORDS: readonly WordSpec[] = [
  { text: "DayChi", x: 0, y: 0, fontSize: 100, size: "big" },
  { text: "COFFEE", x: -17, y: 86, fontSize: 34, size: "small" },
  { text: "MAP", x: 195, y: 86, fontSize: 34, size: "small" },
];

interface PositionedLetter {
  char: string;
  /** 全単語を通したグローバルな文字index(0始まり。D=0, a=1, ... P=14) */
  globalIndex: number;
}

interface PositionedWord extends WordSpec {
  letters: readonly PositionedLetter[];
}

/** WORDSを1文字ずつに分解し、全単語を通したグローバルな文字indexを振る */
function buildPositionedWords(words: readonly WordSpec[]): readonly PositionedWord[] {
  let globalIndex = 0;
  return words.map((word) => {
    const letters = word.text.split("").map((char) => {
      const positioned: PositionedLetter = { char, globalIndex };
      globalIndex += 1;
      return positioned;
    });
    return { ...word, letters };
  });
}

const POSITIONED_WORDS = buildPositionedWords(WORDS);

export function Wordmark({ animate = false, visible = true, className }: WordmarkProps) {
  const rootClassName = [
    styles.wm,
    animate ? styles.drawing : null,
    visible ? null : styles.wmHidden,
    className ?? null,
  ]
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
          {POSITIONED_WORDS.map((word) => (
            <text
              key={`stroke-${word.text}`}
              x={word.x}
              y={word.y}
              fontSize={word.fontSize}
              dominantBaseline="hanging"
              textAnchor="start"
              className={word.size === "big" ? styles.big : styles.small}
            >
              {word.letters.map((letter) => (
                <tspan
                  key={letter.globalIndex}
                  className={`${styles.strokeText} ${word.size === "big" ? styles.big : styles.small}`}
                  style={
                    { "--char-delay": `${letter.globalIndex * CHAR_STAGGER_MS}ms` } as CharStyle
                  }
                >
                  {letter.char}
                </tspan>
              ))}
            </text>
          ))}
        </g>
        <g>
          {POSITIONED_WORDS.map((word) => (
            <text
              key={`fill-${word.text}`}
              x={word.x}
              y={word.y}
              fontSize={word.fontSize}
              dominantBaseline="hanging"
              textAnchor="start"
              className={word.size === "big" ? styles.big : styles.small}
            >
              {word.letters.map((letter) => (
                <tspan
                  key={letter.globalIndex}
                  className={styles.fillText}
                  style={
                    { "--char-delay": `${letter.globalIndex * CHAR_STAGGER_MS}ms` } as CharStyle
                  }
                >
                  {letter.char}
                </tspan>
              ))}
            </text>
          ))}
        </g>
      </svg>
    </span>
  );
}
