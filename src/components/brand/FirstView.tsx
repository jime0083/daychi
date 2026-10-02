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
 *   として扱う。ただしタスク8-1のreview FAIL対応として、「アニメーションするかどうかの
 *   判断が終わるまでロゴ自体を見せない」という制御を追加した(wordmarkPhase参照)。
 *   旧実装(タスク7-2)はWordmarkを既定(animate=false)で「常に完全に描かれた最終状態」で
 *   マウントし、判断が終わった後にanimate=trueへ切り替えていたため、判断が終わるまでの
 *   短い間(フォント読み込み待ち等)に「完成形のロゴが一瞬見えてから、描画し直される
 *   (undrawn状態に戻って再度トレースされる)」というフラッシュが発生していた
 *   (2026-10-01ユーザーフィードバック)。
 *   そのため、wordmarkPhaseを"pending"(SSR/初回描画の既定値。Wordmarkをvisible=falseで
 *   マウントし、見た目には何も表示しない)→ 判断が終わった時点で"static"(動きを減らす設定。
 *   visible=true・animate=falseで完成形を即時表示)または"animating"
 *   (通常の設定。書体読み込み確認を待ってからvisible=true・animate=trueを同時に
 *   立てる)のいずれかへ一度だけ遷移させる3状態に分ける。"pending"の間は利用者に
 *   完成形も未完成形も一切見せないため、どちらの分岐でも「完成形→描き直し」のフラッシュが
 *   発生しない(フォント読み込み前にフォールバック書体の字形が見えることも、
 *   visible=falseのため同様に防げる)。
 * - 遷移(closing→hidden)は固定待ちやtransitionendイベントに依存せず、setTimeoutで
 *   駆動するstate machineとする。
 *
 * 設計判断(タスク8-1a、problem.txt P-033対応。2026-10-01、review FAIL 1回目を受けて再設計):
 * - 旧実装(タスク8-1まで)は自動遷移のタイマー(AUTO_ADVANCE_MS=3000ms)を
 *   「ファーストビューがマウントされた時点」から数えていた。一方、1文字ずつ書く演出
 *   (wordmarkPhase="animating")は書体の読み込み完了を待ってから始まるため、書体の
 *   読み込みに時間がかかる環境では「15文字を書き終える前に地図へ切り替わってしまう」
 *   おそれがあった(ローカル・本番相当の実測でも余裕は約0.65秒しかなく、回線の遅い
 *   スマホ等では容易に逆転しうる)。
 * - 1回目の修正(document.fonts.readyを待ち、1.5秒を超えたら代替書体のまま完成形を
 *   即時表示するフォールバック)はreview FAILとなった。理由は2つ:
 *   (1) `document.fonts.ready`は「ページ上で現在マッチしている全ての書体」の読み込み
 *       完了を待つに過ぎず、next/fontがFOUT対策として用意する「メトリクス調整された
 *       フォールバック書体(例: "Oleo Script Fallback"。常に即座に読み込み済み扱い)」
 *       だけで条件を満たしてしまい、実書体(Oleo Script/Vollkorn)への切り替わりを
 *       検知できていなかった(Wordmark.tsxのWORDMARK_BIG_FONT_FAMILY等のコメント参照)。
 *   (2) 1.5秒を超えた時点で「代替書体のまま完成形を表示する」フォールバック自体が、
 *       要件「代替書体で崩れたロゴは一切見せない」に反していた。
 *   この2点について2026-10-01にユーザー決定(requirements.md 3.1.1 2026-10-01決定):
 *   「書体が届くまでロゴは出さず背景のみで待ち、届いたら手書きアニメーションを始める。
 *   約3秒待っても届かない場合はロゴを出さずに地図へ進む」
 * - そのため現在の実装は:
 *   (a) `document.fonts.ready`ではなく`document.fonts.load()`/`check()`で、ロゴが実際に
 *       使う書体(ファミリー名・太さ・文字)だけを明示的に指定して判定する
 *       (areLogoFontsLoaded/waitForLogoFonts参照。Wordmark.tsxが公開する
 *       WORDMARK_BIG_FONT_FAMILY等を使う)
 *   (b) 書体が揃うまでの間はwordmarkPhase="pending"のまま(ロゴは一切見せない。
 *       「静的な完成形をとりあえず代替書体で見せる」フォールバックは廃止した)
 *   (c) 書体がFONT_GIVE_UP_MS(約3秒)以内に揃った場合のみ、動きを減らす設定なら
 *       "static"(完成形を即時表示)、通常の設定なら"animating"(1文字ずつ書く)に遷移する。
 *       自動遷移までの時間は設定によって異なる:
 *       - 通常の設定: 書体が揃ってからWORDMARK_DRAW_DURATION_MS(約2.3秒の描画)+
 *         HOLD_AFTER_LOGO_MS(約0.7秒)後
 *       - 動きを減らす設定: requirements.md 3.1.1・タスク7-2「約3秒(またはタップ)で
 *         切り替える」を維持するため(2026-10-02 coordinator指摘でタスク8-1a当初の実装を修正)、
 *         マウントからの目標時刻を max(FONT_GIVE_UP_MS, 書体が揃った経過時間 +
 *         HOLD_AFTER_LOGO_MS) とする。書体がすぐ揃えば従来通り約3秒待って切り替わり、
 *         書体が揃うのが遅いほど「揃ってから少なくともHOLD_AFTER_LOGO_MSは見せる」側が優先される
 *   (d) FONT_GIVE_UP_MSを超えても書体が揃わない場合は、動きを減らす設定かどうかに関わらず
 *       ロゴを一切表示しないまま(wordmarkPhaseは"pending"のまま)地図画面へ進む
 *   (e) (c)と(d)は互いに独立して解決しうるため、settledフラグで「先に確定した方を採用し、
 *       後から来たもう一方は無視する」(例: 3秒あきらめた直後に書体読み込みが完了しても、
 *       ロゴを表示する側へ後戻りしない。表示が二転三転するのを避けるため)
 * - React 18のStrictMode(Next.jsの既定でdev時に有効)はマウント時に各useEffectを
 *   「実行→クリーンアップ→再実行」する。sessionStorageの判定はmarkFirstViewSeen後の
 *   2回目の実行ではhasSeenFirstView()がtrueになるため早期returnし、タイマー/
 *   イベントリスナーもそれぞれのeffectのクリーンアップで確実に後始末されるため、
 *   二重登録・二重タイマーは発生しない。
 *   このeffectにはあえてクリーンアップ関数を持たせない。StrictModeの
 *   「実行→クリーンアップ→再実行」は実際の副作用(Promise.resolve().then()以降)が
 *   動く前の同期フェーズで起きるため、もしここでクリーンアップ時にsettled等を
 *   確定させてしまうと、1回目の実行自身の非同期処理(書体読み込み待ち・タイムアウト)を
 *   動く前に無効化してしまい、dev環境でロゴが一切アニメーション/表示されなくなる
 *   (decidedRefにより2回目の実行は何もしないため、1回目の実行だけが唯一有効な
 *   処理であり、それを自分自身のクリーンアップで止めてはならない)。
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Wordmark,
  WORDMARK_BIG_FONT_FAMILY,
  WORDMARK_BIG_FONT_WEIGHT,
  WORDMARK_BIG_TEXT,
  WORDMARK_DRAW_DURATION_MS,
  WORDMARK_SMALL_FONT_FAMILY,
  WORDMARK_SMALL_FONT_WEIGHT,
  WORDMARK_SMALL_TEXT,
} from "@/components/brand/Wordmark";
import { hasSeenFirstView, markFirstViewSeen, prefersReducedMotion } from "@/lib/first-view";

/** ファーストビュー全体のオーバーレイに付与するdata-testid */
export const FIRST_VIEW_TEST_ID = "first-view";
/** 「タップでスキップ」の案内に付与するdata-testid */
export const FIRST_VIEW_SKIP_HINT_TEST_ID = "first-view-skip-hint";

/**
 * 書体の読み込みを待つ上限(ms)(タスク8-1a・problem.txt P-033、2026-10-01ユーザー決定
 * 「約3秒待っても届かない場合はロゴを出さずに地図へ進む」)。
 * これを超えても「ロゴが実際に使う書体(実書体。代替書体は含まない)」が揃わない場合は、
 * 動きを減らす設定かどうかに関わらずロゴを一切表示せずに地図画面へ進む。
 */
const FONT_GIVE_UP_MS = 3000;
/**
 * ロゴの描画(アニメーションまたは静的な完成形表示)が確定してから、完成形を少し見せる
 * ために待つ最低時間(ms)(タスク8-1a)。
 * - 通常の設定: 書体の読み込みが正常な速さであれば
 *   「WORDMARK_DRAW_DURATION_MS(約2.3秒)+ HOLD_AFTER_LOGO_MS(約0.7秒)」で
 *   従来通りの「全体で約3秒」の体感を保つ
 * - 動きを減らす設定: マウントからFONT_GIVE_UP_MS(約3秒)経っていればその時点で切り替え、
 *   もし書体が揃うのがそれより遅ければ、揃ってから最低でもこのHOLD_AFTER_LOGO_MSは
 *   完成形を見せてから切り替える(2026-10-02 coordinator指摘対応。詳細は上部のコメント参照)
 */
const HOLD_AFTER_LOGO_MS = 700;
/** フェードアウトを開始してから地図画面へ完全に切り替える(DOMから外す)までの時間 */
const FADE_OUT_MS = 300;

type Phase = "visible" | "closing" | "hidden";

/**
 * ロゴ(Wordmark)自体の表示状態(タスク8-1、上記コメント参照)。
 * - "pending": 判断待ち、または書体を最後まで待てずにあきらめた。ロゴは見えない(visible=false)
 * - "static": 動きを減らす設定で、かつ実書体が揃った。ロゴを完成形で即時表示(animate=false)
 * - "animating": 通常の設定で、かつ実書体が揃った。1文字ずつ書く演出を再生(animate=true)
 */
type WordmarkPhase = "pending" | "static" | "animating";

/**
 * ロゴが実際に使う書体(Wordmark.tsxが公開する定数。詳しい経緯は上記コメント参照)を
 * CSS Font Loading APIのfont省略形(スタイル名を含まないため"<weight> <size> <family>")
 * に変換したもの。sizeの値自体はcheck/loadの判定結果に影響しない(任意の正数でよい)ため
 * 固定値を使う。
 */
const BIG_FONT_SPEC = `${WORDMARK_BIG_FONT_WEIGHT} 16px "${WORDMARK_BIG_FONT_FAMILY}"`;
const SMALL_FONT_SPEC = `${WORDMARK_SMALL_FONT_WEIGHT} 16px "${WORDMARK_SMALL_FONT_FAMILY}"`;

/**
 * ロゴが実際に使う書体(実書体。next/fontのメトリクス調整フォールバックは含まない)が、
 * ロゴの文字を描画するのに必要な分だけ読み込み済みかどうかを判定する(タスク8-1a)。
 * document.fontsが使えない環境では判定できないため、安全側(待たせない)に倒してtrueを返す。
 */
function areLogoFontsLoaded(): boolean {
  try {
    if (typeof document === "undefined" || !document.fonts) {
      return true;
    }
    return (
      document.fonts.check(BIG_FONT_SPEC, WORDMARK_BIG_TEXT) &&
      document.fonts.check(SMALL_FONT_SPEC, WORDMARK_SMALL_TEXT)
    );
  } catch {
    return true;
  }
}

/**
 * ロゴが実際に使う書体の読み込みを開始し、完了を待つ(タスク8-1a)。
 * document.fonts.load()はブラウザの通常の読み込みキュー(next/fontの<link rel="preload">等)
 * に相乗りするため、既に読み込み中/読み込み済みであっても安全に呼べる(冪等)。
 * document.fontsが使えない環境では判定自体ができないため、即座に解決する
 * (この場合areLogoFontsLoaded()もtrueを返すため、呼び出し側はすぐ次に進む)。
 */
function waitForLogoFonts(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.fonts) {
      return Promise.all([
        document.fonts.load(BIG_FONT_SPEC, WORDMARK_BIG_TEXT).catch(() => undefined),
        document.fonts.load(SMALL_FONT_SPEC, WORDMARK_SMALL_TEXT).catch(() => undefined),
      ]).then(() => undefined);
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
  // SSR/初回クライアント描画のどちらでも同じ値("pending")になる固定初期値
  // (上記コメント参照。判断が終わるまでロゴを一切見せない)
  const [wordmarkPhase, setWordmarkPhase] = useState<WordmarkPhase>("pending");

  const finish = useCallback(() => {
    setPhase((current) => (current === "visible" ? "closing" : current));
  }, []);

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
    // 動きを減らす設定時の「約3秒」を測るための基準時刻(このeffectの開始 ≈
    // オーバーレイがマウントされた時点。coordinator指摘対応。下記のreducedMotion分岐参照)
    const mountedAt = Date.now();

    /**
     * 自動遷移のタイマーを(再)設定する(タスク8-1a)。ロゴの表示状態が確定した時点
     * (アニメーション開始・静的表示・あきらめ)で呼ぶことで、「ファーストビューの表示開始」
     * ではなく「ロゴの表示状態が確定した時点」を基準にできる。呼び出しは常に1回のみ
     * (あきらめ/書体が揃ったのいずれか1つの分岐のみが実行されるため)なので、
     * 多重にタイマーが走ることはない。
     */
    function scheduleAutoAdvance(delayMs: number): void {
      setTimeout(finish, delayMs);
    }

    // 書体を待つことをあきらめるタイムアウトと、書体が実際に揃ったことの検知は互いに
    // 独立して解決しうるため、先に確定した方だけを採用し、後から来たもう一方は無視する
    let settled = false;
    let giveUpTimeoutId: ReturnType<typeof setTimeout> | null = null;

    Promise.resolve().then(() => {
      if (hasSeenFirstView()) {
        setPhase("hidden");
        return;
      }
      markFirstViewSeen();

      const reducedMotion = prefersReducedMotion();

      giveUpTimeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        // 書体がFONT_GIVE_UP_MSを超えても揃わない: 代替書体のロゴは一切見せず
        // (wordmarkPhaseは"pending"のまま)、即座に地図画面へ進む
        finish();
      }, FONT_GIVE_UP_MS);

      waitForLogoFonts().then(() => {
        if (settled || !areLogoFontsLoaded()) {
          // まだ実書体が揃っていない(load()のPromiseが解決しても、何らかの理由で
          // check()がfalseを返す場合も含む)。giveUpTimeoutIdに判断を委ねる
          return;
        }
        settled = true;
        if (giveUpTimeoutId !== null) {
          clearTimeout(giveUpTimeoutId);
        }
        // visible=trueと(必要なら)animate=trueを同時に立てるため、代替書体のロゴが
        // 一瞬見えることはない
        if (reducedMotion) {
          setWordmarkPhase("static");
          // requirements.md 3.1.1・タスク7-2「動きを減らす設定では完成形を表示し、
          // 約3秒(またはタップ)で切り替える」を維持する(coordinator指摘対応、2026-10-02)。
          // 書体が揃うタイミングによらず「マウントから約3秒」の体感を保ちたいため、
          // 自動遷移の目標時刻(マウント基準)を max(FONT_GIVE_UP_MS, 書体が揃った経過時間 +
          // HOLD_AFTER_LOGO_MS) とする。書体がすぐ揃えば従来通り約3秒待ってから切り替わり、
          // 書体が揃うのがFONT_GIVE_UP_MSに近いほど「揃ってから少なくとも
          // HOLD_AFTER_LOGO_MSは見せてから切り替える」側が優先される
          const elapsedSinceMount = Date.now() - mountedAt;
          scheduleAutoAdvance(Math.max(FONT_GIVE_UP_MS - elapsedSinceMount, HOLD_AFTER_LOGO_MS));
        } else {
          setWordmarkPhase("animating");
          scheduleAutoAdvance(WORDMARK_DRAW_DURATION_MS + HOLD_AFTER_LOGO_MS);
        }
      });
    });
  }, [finish]);

  // キーボード操作(Enter/Space/Escape)での即時遷移。自動遷移のタイマーは上のeffectで
  // ロゴの表示状態が確定した時点でscheduleAutoAdvanceするため、ここでは持たない(タスク8-1a)
  useEffect(() => {
    if (phase !== "visible") {
      return;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
        finish();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
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
      <Wordmark
        visible={wordmarkPhase !== "pending"}
        animate={wordmarkPhase === "animating"}
        className="text-[clamp(4rem,14vw,8.5rem)]"
      />
      <span
        data-testid={FIRST_VIEW_SKIP_HINT_TEST_ID}
        className="absolute bottom-4 text-[0.78rem] text-[#6b6b6b]"
      >
        タップでスキップ
      </span>
    </div>
  );
}
