"use client";

/**
 * 公開トップページ(/)のファーストビュー(タスク7-2)。
 *
 * requirements.md 3.1.1「デザイン・ファーストビュー」に基づき、サイトを開いた直後に
 * 画面全体へロゴ(DayChi COFFEE MAP)を表示し、以下のいずれかで地図画面(Home本体)へ
 * 切り替える:
 *   - 約3秒後に自動的に切り替える
 *   - 画面をクリック/タップする
 *   - キーボード操作(Enter/Space/Escape)を行う
 * 表示はブラウザのタブごとに初回のみ(sessionStorage。src/lib/first-view.ts)。
 * 動きを減らす設定(prefers-reduced-motion: reduce)の利用者には、ロゴの描画アニメーション
 * (縁取り→塗り)を行わずに最終状態のロゴを表示する。
 *
 * 設計判断(review FAIL 1回目・フリッカー修正。2026-10-01):
 * - 初期状態("phase")は"visible"を既定値とする(sessionStorageを参照せず、SSR/初回クライアント
 *   描画の両方で同じ固定値になる。ハイドレーション不整合なし)。これにより初回アクセス時は
 *   サーバーが返す生HTMLの時点から既にオーバーレイ(#DADADA背景)が存在し、JS読み込み・
 *   hydration完了を待つ間も背後の公開ページが1フレームも見えない(旧実装はuseEffect後に
 *   初めてvisibleにしていたため、その間サイドバーの文字等が透けて見えていた。
 *   証拠: e2e/artifacts/review-7-2/flicker-desktop-frames.json)。
 * - 逆に「同じタブでの再読み込みでは表示しない」という要件は、サーバーが常にvisibleを
 *   返す前提だとReact側だけでは(sessionStorageはクライアントAPIのため)瞬時に判定できない。
 *   そこでsrc/app/layout.tsxのブロッキングスクリプト(next/script strategy="beforeInteractive"。
 *   hydrationより前に実行される)が、既読みなら<html>にdata-first-view="seen"を付与し、
 *   globals.cssの属性セレクタでオーバーレイをdisplay:noneにする。このCSSはReactの
 *   描画状態と無関係に最初のペイントから効くため、再読み込み時は1フレームもオーバーレイが
 *   見えない。マウント後のuseEffectでsessionStorageを確認し、既読みであればReact側の状態も
 *   "hidden"にしてDOMから外す(CSSで既に見えなくなっているため、この後始末自体に
 *   ちらつき防止上の意味はないが、不要なタイマー等を止めるために行う)。
 * - ロゴの描画アニメーション自体は、上記の「オーバーレイの表示/非表示」とは別軸の関心事
 *   として扱う。Wordmarkは既定(animate=false)で「常に完全に描かれた最終状態」を表示する
 *   (これもSSR/初回描画から一貫しており、空白や壊れた見た目のフラッシュを避ける)。
 *   初回訪問と判定でき、かつ動きを減らす設定でない場合のみ、フォント読み込み完了
 *   (document.fonts.ready)を待ってからshouldAnimateをtrueにし、Wordmarkに
 *   「一度undrawn状態に戻して描き直す」アニメーションを再生させる(フォント読み込み前に
 *   フォールバック書体の字形で描画が始まり、読み込み完了後に字形が変わる違和感を避ける)。
 * - 遷移(closing→hidden)は固定待ちやtransitionendイベントに依存せず、setTimeoutで
 *   駆動するstate machineとする。
 * - React 18のStrictMode(Next.jsの既定でdev時に有効)はマウント時に各useEffectを
 *   「実行→クリーンアップ→再実行」する。sessionStorageの判定はmarkFirstViewSeen後の
 *   2回目の実行ではhasSeenFirstView()がtrueになるため早期returnし、タイマー/
 *   イベントリスナーもそれぞれのeffectのクリーンアップで確実に後始末されるため、
 *   二重登録・二重タイマーは発生しない。
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import { hasSeenFirstView, markFirstViewSeen, prefersReducedMotion } from "@/lib/first-view";

/** ファーストビュー全体のオーバーレイに付与するdata-testid */
export const FIRST_VIEW_TEST_ID = "first-view";
/** 「タップでスキップ」の案内に付与するdata-testid */
export const FIRST_VIEW_SKIP_HINT_TEST_ID = "first-view-skip-hint";

/** 自動的に地図画面へ切り替わるまでの時間(requirements.md「約3秒」) */
const AUTO_ADVANCE_MS = 3000;
/** フェードアウトを開始してから地図画面へ完全に切り替える(DOMから外す)までの時間 */
const FADE_OUT_MS = 300;

type Phase = "visible" | "closing" | "hidden";

/** document.fonts が使えない環境でも例外を投げずに解決するPromiseを返す */
function waitForFontsReady(): Promise<unknown> {
  try {
    if (typeof document !== "undefined" && document.fonts) {
      return document.fonts.ready.catch(() => undefined);
    }
  } catch {
    // 何もしない。下のPromise.resolve()にフォールバックする
  }
  return Promise.resolve();
}

export function FirstView() {
  // SSR/初回クライアント描画のどちらでも同じ値("visible")になる固定初期値
  // (フリッカー修正の要。上記コメント参照)
  const [phase, setPhase] = useState<Phase>("visible");
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // マウント後(クライアントのみ)の判定。setState呼び出しはPromise.resolve().then()の中で行う
  // (react-hooks/set-state-in-effect対応。他のadmin画面の初回読み込みeffectと同じ設計。
  // src/app/admin/import/page.tsx参照)。
  //
  // decidedRef: React 18のStrictMode(Next.jsの既定でdev時に有効)はマウント時に各useEffectを
  // 「実行→クリーンアップ→再実行」する。このeffectはmarkFirstViewSeen()という「読んだ結果に
  // 応じて自分自身の判定材料(sessionStorage)を書き換える」副作用を持つため、クリーンアップを
  // 挟まない素朴な実装のままだと、1回目の実行で「初回」と判定してseen扱いにした直後、
  // (実際にはユーザーの操作を挟んでいない)2回目の実行が「既に見た」と誤判定してphaseを
  // 即座に"hidden"にしてしまう(実機検証で発見。マウントから約100ms程度でオーバーレイが
  // 消えるバグを引き起こしていた)。decidedRef(コンポーネントインスタンスの生存中は
  // StrictMode double-invoke間でも保持される)で「この判定は既に行った」ことを記録し、
  // 2回目の実行は完全なno-opにすることで、実際のタブ再読み込み(=真に新しいマウント)との
  // 判別を保つ。
  const decidedRef = useRef(false);
  useEffect(() => {
    if (decidedRef.current) {
      return;
    }
    decidedRef.current = true;
    Promise.resolve().then(() => {
      if (hasSeenFirstView()) {
        setPhase("hidden");
        return;
      }
      markFirstViewSeen();
      if (prefersReducedMotion()) {
        // 最終状態(完全に描かれた状態)のまま。描画アニメーションは行わない
        return;
      }
      waitForFontsReady().then(() => {
        setShouldAnimate(true);
      });
    });
  }, []);

  const finish = useCallback(() => {
    setPhase((current) => (current === "visible" ? "closing" : current));
  }, []);

  // 自動遷移タイマーと、キーボード操作(Enter/Space/Escape)での即時遷移
  useEffect(() => {
    if (phase !== "visible") {
      return;
    }
    const timer = setTimeout(finish, AUTO_ADVANCE_MS);
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        finish();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [phase, finish]);

  // フェードアウト後にDOMから外す(transitionendに依存せず確実に切り替える)。
  // 動きを減らす設定では見た目の遷移(motion-reduce:duration-0)も即時なので、
  // DOMから外すまでの待ち時間も合わせて短くする
  useEffect(() => {
    if (phase !== "closing") {
      return;
    }
    const timer = setTimeout(
      () => {
        setPhase("hidden");
      },
      prefersReducedMotion() ? 0 : FADE_OUT_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      data-testid={FIRST_VIEW_TEST_ID}
      onClick={finish}
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-[#DADADA] transition-opacity duration-300 motion-reduce:duration-0 ${
        phase === "closing" ? "opacity-0" : "opacity-100"
      }`}
    >
      <Wordmark animate={shouldAnimate} className="text-[clamp(4rem,14vw,8.5rem)]" />
      <span
        data-testid={FIRST_VIEW_SKIP_HINT_TEST_ID}
        className="absolute bottom-4 text-[0.78rem] text-[#6b6b6b]"
      >
        タップでスキップ
      </span>
    </div>
  );
}
