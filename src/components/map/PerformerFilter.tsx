"use client";

/**
 * 公開トップページ(/)の出演者フィルタUI(タスク3-4)。
 *
 * requirements.md「3.1 公開ページ」の
 * 「出演者フィルタ: メイン出演者以外の出演者(isMain: false)で絞り込み。
 *   選択した出演者が出演した訪問がある店舗のみ表示」に対応する。
 *
 * 設計判断:
 * - 選択方式は複数選択(チェックボックス)を採用する。単一選択(ラジオボタン/セレクト)
 *   より「複数の推しをまとめて見たい」という利用シーンに自然に対応でき、UIとしても
 *   チェックボックスの方が選択状態が視覚的に分かりやすいため。絞り込みロジック
 *   (src/lib/shop-filter.ts)は選択出演者のいずれかが参加した訪問がある店舗を表示する
 *   OR方式とする(積集合だと0件になりやすく実用性が低いため)。
 * - isMain=false の出演者のみを選択肢として表示する(メイン出演者はフィルタ対象外。
 *   requirements.md「4. データモデル」performers.isMainのコメント「フィルタ対象外にする」
 *   に対応)。表示順は order 昇順(他の出演者一覧表示と同じ方針)。
 * - フィルタ対象の出演者が1人もいない場合(isMain=falseの出演者が0件)は、
 *   UIごと非表示にする(意味のない空フィルタを表示しないため)。
 * - データ取得・絞り込み計算は行わない制御コンポーネント(PublicMap/VideoSidebarと
 *   同じ方針)。選択状態(selectedPerformerIds)とトグルコールバックは呼び出し側
 *   (src/app/page.tsx)が管理する。
 *
 * レイアウト・重なり回避(problem修正: 2026-09-21 daychi-review FAIL対応):
 * - 当初は地図コンテナ内に absolute right-4 top-4 で浮かせるオーバーレイパネルとして
 *   実装していたが、地図のfitBounds結果次第でピン(maplibregl.Marker)がこのパネルの
 *   画面座標と重なり、ピンのクリックをパネルに奪われる(pointer-events intercepted)
 *   リグレッションがdetail-sheet.spec.tsで間欠的に再現した。原因は、パネルが地図
 *   コンテナの「内側」に絶対配置されており、地図(PublicMap)が管理する描画領域と
 *   画面座標空間を共有してしまうこと。
 * - そのため、地図の「上」に専用の帯(バー)としてレイアウトする方式に変更した
 *   (呼び出し側 src/app/page.tsx で、このコンポーネントと地図を縦のflexboxで
 *   並べ、地図はこのバーの残り高さいっぱいに配置する)。これによりピンが実際に
 *   描画されうる領域(地図コンテナのクライアント矩形)からこのバーの領域が完全に
 *   排除されるため、fitBoundsの結果や並行実行中の他テストが投入するデータに
 *   依存せず、ピンとこのバーが画面上で重なることは構造的に起こり得ない。
 * - このバー自体はpointer-events-noneとし、実際に操作可能な出演者一覧(ul要素)
 *   のみpointer-events-autoで復元する。これにより、バーの背景・見出しテキスト部分は
 *   クリックを透過し(下にある詳細シートのオーバーレイ等の操作を妨げない)、
 *   チェックボックス自体は引き続きクリックできる。
 * - z-indexはDetailSheetのオーバーレイ(fixed inset-0, z-40)より高い値(z-60)とする。
 *   詳細シートを開いた状態でもこのバーの出演者チェックボックスを操作可能にするため
 *   (「フィルタで店舗が消えたら詳細シートを自動クローズ」というsrc/app/page.tsxの
 *   togglePerformerId実装に、通常のUI操作から到達できるようにするための対応。
 *   e2e/performer-filter.spec.tsで検証する)。
 *
 * タスク7-3(公開ページのデザイン刷新)での見た目変更:
 * - 見本(docs/design/phase7-ui-mock.html「.filterbar」)のクリーム地+Vollkornの小さな
 *   ラベル+ピル型の選択肢に合わせる。選択中は緑で塗りつぶす。
 * - 実際の`<input type="checkbox">`は見本と異なり非表示にしない(Playwrightの
 *   locator.check()/uncheck()(e2e/mobile-filter-overlap.spec.ts等)が要素の可視性を
 *   前提とするため、force:trueなしで操作できる状態を保つ必要がある。CLAUDE.mdの
 *   「force...は不可」の制約に合わせた意図的な見本との差異)。チェックボックス自体は
 *   小さく・選択色(accent-color)を緑にして違和感を抑える。
 * - レイアウト(帯・pointer-events・z-index)は上記の理由により一切変更しない。
 */
import type { Performer } from "@/types/performer";

/** フィルタパネル本体に付与するdata-testid */
export const PERFORMER_FILTER_TEST_ID = "performer-filter";
/** 各出演者の選択肢(label)に付与するdata-testid */
export const PERFORMER_FILTER_OPTION_TEST_ID = "performer-filter-option";

interface PerformerFilterProps {
  /** 出演者一覧(isMain=trueも含む全件)。このコンポーネント内でisMain=falseのみに絞り込む */
  performers: Performer[];
  /** 選択中の出演者ID一覧 */
  selectedPerformerIds: string[];
  /** 出演者選択のトグル時に呼ばれるコールバック */
  onTogglePerformer: (performerId: string) => void;
}

export function PerformerFilter({
  performers,
  selectedPerformerIds,
  onTogglePerformer,
}: PerformerFilterProps) {
  const filterablePerformers = performers
    .filter((performer) => !performer.isMain)
    .sort((a, b) => a.order - b.order);

  if (filterablePerformers.length === 0) {
    return null;
  }

  return (
    <div
      data-testid={PERFORMER_FILTER_TEST_ID}
      // pointer-events-none: バー自体(背景・パディング・見出しテキスト)はクリックを
      // 透過させる(上のコメント「レイアウト・重なり回避」参照)。実際に操作が必要な
      // ulにのみ pointer-events-auto で復元する
      className="relative z-[60] flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-brand-line bg-brand-paper/95 px-4 py-2 text-sm pointer-events-none"
    >
      <span className="font-brand-display text-xs font-black tracking-wide text-brand-blue">
        出演者で絞り込み
      </span>
      <ul className="flex flex-wrap gap-x-2 gap-y-1.5 pointer-events-auto">
        {filterablePerformers.map((performer) => {
          const isSelected = selectedPerformerIds.includes(performer.id);
          return (
            <li key={performer.id}>
              <label
                data-testid={PERFORMER_FILTER_OPTION_TEST_ID}
                data-performer-id={performer.id}
                data-selected={isSelected ? "true" : "false"}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-brand-green px-3 py-1 text-sm font-bold transition-colors ${
                  isSelected
                    ? "bg-brand-green text-white shadow-[0_2px_0_var(--brand-green-deep)]"
                    : "bg-brand-paper text-brand-green"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onTogglePerformer(performer.id)}
                  className="h-3.5 w-3.5 accent-brand-green"
                />
                {performer.name}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
