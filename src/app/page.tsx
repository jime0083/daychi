"use client";

/**
 * 公開トップページ(/、タスク3-1: 地図表示とピン。タスク3-2: スライドアップ詳細シート)。
 *
 * requirements.md「3.1 公開ページ」に基づき、地図(MapLibre GL + OpenFreeMap)を
 * 全画面表示し、published店舗のみをピン表示する。draft店舗はセキュリティルール
 * (firestore.rules。read: status == "published" のみ誰でも可)によりそもそも
 * 未認証クライアントから取得できないため、listPublishedShops() を使うだけで
 * draft店舗が混入する心配はない(参考: src/repositories/shops.ts)。同様に
 * listPublishedVisits() / listPublishedVideos() もdraftが混入しない。
 *
 * このページは認証不要でアクセスできる(AdminGate配下に置かない)。
 * Firestoreの読み取りはブラウザのFirebase Client SDK(src/lib/firebase.ts)経由で
 * 行うため、/admin配下の各画面と同様「use client」+ useEffect でのデータ取得とする。
 *
 * 地図コンポーネント(src/components/map/PublicMap.tsx)はMapLibreがSSR非対応のため
 * next/dynamic(..., { ssr: false }) でクライアントサイドのみマウントする
 * (src/app/admin/shops/page.tsx の ShopLocationPicker と同じ方針)。
 * DetailSheet(src/components/map/DetailSheet.tsx)はブラウザAPI非依存のため
 * 通常のstatic importで問題ない。
 *
 * タスク3-2で追加したデータフロー:
 * - shops/visits/videos/performersの4コレクションをマウント時に並行取得する
 *   (visits/videosはpublishedのみ。performersはstatus概念を持たないため全件)
 * - ピンクリック(PublicMapのonShopClick)でselectedShopIdを設定する
 * - selectedShopIdに対応するShopと、resolveShopVisitDetails()で算出した
 *   published visit×published videoの組をDetailSheetに渡す
 * - 閉じる操作(閉じるボタン/オーバーレイクリック/地図背景クリック)でselectedShopIdをnullに戻す
 *
 * タスク3-3で追加したデータフロー(サイドバー動画一覧):
 * - デスクトップ幅では画面左にVideoSidebarを配置する(モバイルではhidden。
 *   VideoSidebar.tsx内のTailwindクラスで制御)。地図(PublicMap)はサイドバーの
 *   隣にflex-1で配置し、モバイルではサイドバーが非表示になるため全画面になる。
 * - selectedVideoId(サイドバーで選択中の動画)を新たに保持する。これは
 *   selectedShopId(詳細シート用)とは独立した状態だが、タスク6-1(下記)で
 *   動画クリック時にselectedShopIdも連動して更新するようになった
 *   (ピンクリックは引き続きサイドバーの選択状態を変えない。この向きの独立性は維持)。
 * - selectedVideoIdからsrc/lib/video-shop.tsのresolveVideoShopIds()で
 *   「その動画で紹介されたpublished visitのshopId群」を算出し、
 *   PublicMapのhighlightedShopIdsに渡す(ピンのハイライト表示 + 地図フォーカスの両方に使う)。
 *
 * タスク3-4で追加したデータフロー(出演者フィルタ):
 * - selectedPerformerIds(選択中の出演者ID一覧、複数選択可)を新たに保持する。
 *   PerformerFilter(isMain=falseの出演者のみ選択肢に表示。詳細な設計判断は
 *   src/components/map/PerformerFilter.tsxのコメント参照)のトグル操作で更新する。
 * - src/lib/shop-filter.tsのfilterShopsByPerformers()で、選択出演者のいずれかが
 *   参加したpublished visitを持つ店舗のみに絞り込んだfilteredShopsを算出し、
 *   PublicMapのshopsにはこのfilteredShopsを渡す(選択0件時は絞り込みなし=全件)。
 * - 整合性: フィルタで絞り込まれて表示されなくなった店舗の詳細シートが開いたままに
 *   ならないよう、togglePerformerId内でフィルタ変更後の店舗一覧を計算し、選択中の店舗が
 *   その中に含まれなくなる場合はselectedShopIdもその場でnullに戻す(setState-in-effectを
 *   避けるため、deriveはuseEffectではなくイベントハンドラ内で完結させる設計とした)。
 *   サイドバーの動画一覧・ハイライト(highlightedShopIds)は出演者フィルタの影響を
 *   受けない(仕様上、絞り込み対象は地図のピン表示のみのため)。フィルタで非表示になった
 *   店舗はそもそも地図上にピン(Marker)が生成されないため、ハイライト対象に
 *   含まれていても実害はない(PublicMap.tsx参照)。この自動クローズはe2e/performer-filter.spec.ts
 *   で検証する(詳細シートを開いた状態でPerformerFilterのチェックボックスを操作し、
 *   シートが閉じることを確認する)。
 * - レイアウト: PerformerFilterは地図コンテナの「内側」に浮かせるオーバーレイではなく、
 *   地図の「上」に専用の帯(バー)として配置する(下のJSX参照)。理由は
 *   src/components/map/PerformerFilter.tsxのコメント「レイアウト・重なり回避」を参照
 *   (地図のピンとフィルタパネルの画面座標が重なりクリックを奪い合うリグレッションの対策)。
 *
 * タスク5-3で追加したデータフロー(タグフィルタ・詳細シートのタグ表示):
 * - tags(タグマスタ全件)を新たに取得し、selectedTagIds(選択中のタグID一覧、複数選択可)を
 *   保持する。TagFilter(PerformerFilterと同じ帯レイアウト。src/components/map/TagFilter.tsx
 *   参照)のトグル操作で更新する。
 * - src/lib/shop-filter.tsのcomputeFilteredShops()で、出演者フィルタ→タグフィルタの順に
 *   連続適用したfilteredShopsを算出する(両方の関数とも選択0件なら絞り込みなしの部分集合を
 *   返す純粋関数のため、連続適用するだけで「両方の条件を満たす店舗のみ」というAND結合になる。
 *   requirements.md「出演者フィルタとタグフィルタを両方使う場合は、両方の条件を満たす店舗だけを
 *   表示する」に対応)。
 * - togglePerformerId/toggleTagIdのどちらも、変更後の両条件で絞り込んだ店舗一覧に選択中の
 *   店舗が含まれなくなる場合はselectedShopIdをその場でnullに戻す(既存のtogglePerformerIdと
 *   同じ設計判断。detail-sheetの自動クローズをタグフィルタ操作でも一貫させる)。
 * - DetailSheetにtagsを渡し、店名近くにその店舗のタグ名(order昇順)を表示する
 *   (src/lib/shop-filter.tsのresolveShopTags()。詳細はDetailSheet.tsxのコメント参照)。
 *
 * タスク3-5で追加したデータフロー(モバイルUI: 画面下部タブで地図/動画一覧を切り替え):
 * - activeMobileTab("map" | "videos"、初期値"map")を新たに保持する。
 *   src/components/map/MobileTabBar.tsxの操作でのみ更新される。
 * - デスクトップ幅(md以上)ではこの状態は表示に影響しない(タブ自体を`md:hidden`で
 *   非表示にし、レイアウトも常に「左サイドバー+地図」のまま。requirements.md
 *   「PC表示」を維持する)。
 * - モバイル幅(md未満)では、地図コンテナとsrc/components/map/MobileVideoList.tsx
 *   (デスクトップのVideoSidebar相当の内容)を同じ領域に重ねて配置し、activeMobileTabに
 *   応じてCSSの`hidden`クラスで表示/非表示を切り替える(コンポーネントの
 *   マウント/アンマウントは行わない)。これは、PublicMap(MapLibre)を
 *   アンマウント→再マウントすると地図インスタンスの再初期化コスト・状態(中心座標/
 *   ズーム/fitBounds結果)のリセットが発生するため、タブ切り替えのたびに
 *   地図を作り直さずに済むようにするための設計判断である。
 * - モバイルの動画一覧(MobileVideoList)で動画をクリックした場合、デスクトップの
 *   VideoSidebarクリック時と同じくselectedVideoIdを更新して地図フォーカス・
 *   ハイライトを反映しつつ、加えてactiveMobileTabを"map"に切り替える
 *   (handleVideoClick関数)。「動画をタップすると地図タブに切り替わり該当店舗に
 *   フォーカスする」という動線が、動画一覧を見る目的(店を探す)と地図で確認する目的を
 *   1操作でつなげる自然な流れになるための設計判断(この関数はデスクトップの
 *   VideoSidebarのonVideoClickにも同じものを渡すが、デスクトップではタブ自体を
 *   表示しないためactiveMobileTabの変更は見た目に影響しない)。
 * - PerformerFilter(出演者フィルタの帯)はタブに関わらず常に表示する(絞り込みは
 *   地図のピン表示に対する機能のため、動画一覧タブ中でも表示したままにして
 *   タブ切り替えのたびに出し分けるコストを避ける。実害はない: 動画一覧タブ表示中に
 *   フィルタを操作しても、地図タブに戻ればその絞り込みが反映された状態で表示される)。
 *
 * タスク6-1で追加したデータフロー(動画クリックで詳細シートも開く。P-019):
 * - requirements.md「動画をクリックすると、あわせてその店舗の詳細シートも
 *   スライドアップする(PCサイドバー・モバイル動画一覧タブ共通)。出演者/タグの
 *   絞り込みで地図に表示されていない店舗のシートは開かない。1動画で複数店舗を
 *   紹介する動画は現状ないため考慮しない」(2026-09-25決定)に対応する。
 * - handleVideoClick内で、src/lib/video-shop.tsのresolveVideoClickShopId()に
 *   videoId・visits・現在のfilteredShops(出演者/タグ絞り込み後に地図へ表示中の
 *   店舗一覧)を渡し、その結果(店舗ID、または開かないことを示すnull)を
 *   そのままsetSelectedShopIdに渡す。条件を満たさない場合(紹介店舗が0件/複数件、
 *   または絞り込みで非表示)はnullが返るため、動画クリック前に別の店舗の詳細シートが
 *   開いていた場合はそのシートも閉じる(クリックした動画と無関係な店舗のシートが
 *   開いたままにならないようにするための設計判断。togglePerformerId/toggleTagIdの
 *   自動クローズと同じ考え方)。
 * - デスクトップ(VideoSidebar)・モバイル(MobileVideoList、地図タブへの自動切り替え後)の
 *   どちらもhandleVideoClickを共用するため、この動作は両方に同時に反映される。
 *
 * タスク7-2で追加したファーストビュー:
 * - src/components/brand/FirstView.tsx を常に(初回か否かに関わらず)マウントする。
 *   FirstView自身がsessionStorageで初回かどうかを判定し、初回でなければ何もレンダリング
 *   しない(詳細はFirstView.tsxのコメント参照)。地図・サイドバー等の本体は下記の通り
 *   常にマウントしたままなので、ファーストビュー表示中も裏側で読み込みが進む
 *   (requirements.md「ファーストビュー表示中も地図画面はその裏で読み込んでおき、
 *   切り替え後すぐ使えるようにする」に対応)。
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { FirstView } from "@/components/brand/FirstView";
import { DetailSheet } from "@/components/map/DetailSheet";
import { MobileTabBar, type MobileTab } from "@/components/map/MobileTabBar";
import { MobileVideoList } from "@/components/map/MobileVideoList";
import { PerformerFilter } from "@/components/map/PerformerFilter";
import { TagFilter } from "@/components/map/TagFilter";
import { VideoSidebar } from "@/components/map/VideoSidebar";
import { resolveShopVisitDetails } from "@/lib/shop-detail";
import { filterShopsByPerformers, filterShopsByTags } from "@/lib/shop-filter";
import { resolveVideoClickShopId, resolveVideoShopIds } from "@/lib/video-shop";
import { listPerformers } from "@/repositories/performers";
import { listPublishedShops } from "@/repositories/shops";
import { listTags } from "@/repositories/tags";
import { listPublishedVideos } from "@/repositories/videos";
import { listPublishedVisits } from "@/repositories/visits";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";
import type { Video } from "@/types/video";
import type { Visit } from "@/types/visit";

/**
 * 出演者フィルタ→タグフィルタの順に連続適用し、両方の条件を満たす店舗一覧を返す
 * (タスク5-3。src/lib/shop-filter.tsのコメント「出演者フィルタとタグフィルタの併用(AND)」参照)。
 */
function computeFilteredShops(
  shops: Shop[],
  visits: Visit[],
  selectedPerformerIds: string[],
  selectedTagIds: string[],
): Shop[] {
  const byPerformers = filterShopsByPerformers(shops, visits, selectedPerformerIds);
  return filterShopsByTags(byPerformers, selectedTagIds);
}

const PublicMap = dynamic(() => import("@/components/map/PublicMap").then((mod) => mod.PublicMap), {
  ssr: false,
  loading: () => (
    <div
      data-testid="public-map-loading"
      className="flex h-full w-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400"
    >
      地図を読み込み中...
    </div>
  ),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Home() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>("map");
  // 出演者/タグ絞り込み帯(PerformerFilter+TagFilter)の実測高さ(px)。
  // タスク6-3a(P-029)対応: 下記のfilterBarRef用useEffect参照
  const [filterBarHeightPx, setFilterBarHeightPx] = useState(0);

  // アンマウント後の setState を防ぐガード(/admin配下の各画面と同じパターン)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 出演者/タグ絞り込み帯(PerformerFilter+TagFilter)の実測高さを追跡する
  // (タスク6-3a・P-029対応)。
  //
  // 背景・原因(P-029): PerformerFilter/TagFilterは地図の「上」に通常のドキュメントフローで
  // 配置され、選択肢(出演者・タグ)の件数に応じて高さが伸びる(上限なし)。一方DetailSheetは
  // 画面下端に固定表示され、内容量に応じて最大80vh(max-h-[80vh])まで伸びる。両者の高さの
  // 合計が画面高さを超えると、より高いz-index(z-[60])を持つ絞り込み帯がDetailSheetの
  // 上部(閉じるボタン等)を画面座標上で覆ってしまい、絞り込み帯のクリックを奪う
  // (pointer-events-autoなul要素がDetailSheetより手前になるため)。実際に出演者・タグが
  // 出演者10件・タグ10件程度に増えたモバイル幅では、絞り込み帯の高さだけで画面の3〜4割を
  // 占めうることを実測で確認した。
  //
  // 修正方針: 絞り込み帯自体の見た目(全項目をラップ表示する現行デザイン)は変更しない
  // (これはrequirements.mdで決まっていない新規UI変更に該当するため導入しない)。代わりに、
  // DetailSheet.tsxの既存の対処パターン(PCでVideoSidebarの幅だけmd:left-72で避ける)と
  // 同じ考え方で、DetailSheetの最大高さを「絞り込み帯の実測高さを差し引いた残り画面高さ」で
  // 追加的に制限する(min(80vh, 100dvh - 絞り込み帯高さ))。これにより絞り込み帯がどれだけ
  // 伸びてもDetailSheetの上端が絞り込み帯の下端より上に来ることがなくなり、両者は画面座標上で
  // 重ならなくなる(絞り込み帯は常に全項目がクリックでき、DetailSheetは必要なら内部スクロール
  // (既存のoverflow-y-auto)で対応する)。
  const filterBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = filterBarRef.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setFilterBarHeightPx(entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    Promise.all([
      listPublishedShops(),
      listPublishedVisits(),
      listPublishedVideos(),
      listPerformers(),
      listTags(),
    ])
      .then(([shopList, visitList, videoList, performerList, tagList]) => {
        if (mountedRef.current) {
          setShops(shopList);
          setVisits(visitList);
          setVideos(videoList);
          setPerformers(performerList);
          setTags(tagList);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setLoadError(`店舗情報の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  // 出演者フィルタ(タスク3-4)・タグフィルタ(タスク5-3)で選択された条件を両方満たす
  // 店舗のみに絞り込む(選択0件の場合はその条件については絞り込みなし)
  const filteredShops = useMemo(
    () => computeFilteredShops(shops, visits, selectedPerformerIds, selectedTagIds),
    [shops, visits, selectedPerformerIds, selectedTagIds],
  );

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? null,
    [shops, selectedShopId],
  );

  const selectedShopVisitDetails = useMemo(
    () => (selectedShop === null ? [] : resolveShopVisitDetails(selectedShop.id, visits, videos)),
    [selectedShop, visits, videos],
  );

  // サイドバー表示用: 公開日降順(新しい動画が上)に並べ替える
  const sortedVideos = useMemo(
    () => [...videos].sort((a, b) => b.publishedAt.toMillis() - a.publishedAt.toMillis()),
    [videos],
  );

  // 選択中の動画で紹介されたpublished visitの店舗ID一覧(0件/複数件どちらもありうる)。
  // PublicMapのhighlightedShopIdsに渡し、ピンのハイライト表示と地図フォーカスの両方に使う
  const highlightedShopIds = useMemo(
    () => (selectedVideoId === null ? [] : resolveVideoShopIds(selectedVideoId, visits)),
    [selectedVideoId, visits],
  );

  function closeDetailSheet(): void {
    setSelectedShopId(null);
  }

  // 動画一覧(デスクトップのVideoSidebar/モバイルのMobileVideoListの両方で共用)クリック時:
  // 従来通り地図フォーカス・ハイライトの対象動画を更新しつつ、モバイルでは地図タブに
  // 切り替える(デスクトップではタブ自体を表示しないため見た目に影響しない)。
  // タスク6-1(P-019)で追加: あわせて詳細シートの表示状態も更新する。
  // resolveVideoClickShopId()(src/lib/video-shop.ts)が「その動画で紹介された
  // published店舗が1件、かつ出演者/タグ絞り込み後もfilteredShopsに含まれる」場合のみ
  // 店舗IDを返し、それ以外(0件/複数件/絞り込みで非表示)はnullを返す。
  // 常にsetSelectedShopId()を呼ぶことで、条件を満たさない場合は無関係な店舗の
  // 詳細シートが開いたままにならないよう閉じる(nullなら閉じる、既に閉じていれば
  // no-op)設計としている(togglePerformerId/toggleTagIdの自動クローズと同じ考え方)。
  function handleVideoClick(videoId: string): void {
    setSelectedVideoId(videoId);
    setActiveMobileTab("map");
    setSelectedShopId(resolveVideoClickShopId(videoId, visits, filteredShops));
  }

  // フィルタ変更で表示対象から外れた店舗の詳細シートが開いたままにならないよう、
  // 変更後の店舗一覧に選択中の店舗が含まれなくなる場合はselectedShopIdもここで閉じる
  // (useEffectでのderiveはsetState-in-effectの警告対象になるため、イベントハンドラ内で完結させる)
  function togglePerformerId(performerId: string): void {
    const nextPerformerIds = selectedPerformerIds.includes(performerId)
      ? selectedPerformerIds.filter((id) => id !== performerId)
      : [...selectedPerformerIds, performerId];
    setSelectedPerformerIds(nextPerformerIds);

    const nextFilteredShops = computeFilteredShops(shops, visits, nextPerformerIds, selectedTagIds);
    if (selectedShopId !== null && !nextFilteredShops.some((shop) => shop.id === selectedShopId)) {
      setSelectedShopId(null);
    }
  }

  // togglePerformerIdと同じ設計(タスク5-3: タグフィルタでも自動クローズを一貫させる)
  function toggleTagId(tagId: string): void {
    const nextTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(nextTagIds);

    const nextFilteredShops = computeFilteredShops(shops, visits, selectedPerformerIds, nextTagIds);
    if (selectedShopId !== null && !nextFilteredShops.some((shop) => shop.id === selectedShopId)) {
      setSelectedShopId(null);
    }
  }

  return (
    <main
      data-testid="public-map-page"
      className="flex h-dvh w-full flex-col overflow-hidden md:flex-row"
    >
      <VideoSidebar
        videos={sortedVideos}
        selectedVideoId={selectedVideoId}
        onVideoClick={handleVideoClick}
      />
      <div className="flex min-h-0 w-full flex-1 flex-col">
        {/* max-h-[30dvh] overflow-y-auto: タスク6-3a(P-029)対応。出演者/タグの選択肢が
            多い場合(実測: 各10件程度でモバイル幅の高さの大半)でも、この帯自体の高さを
            画面高さの30%までに抑えて地図の表示領域(下のrelative divのflex-1)を必ず
            確保する。選択肢が多い分はこの帯の中で内部スクロールして選ぶ(既存の
            DetailSheet.tsxのmax-h-[80vh]+overflow-y-autoと同じ「伸びうる内容は上限+内部
            スクロールで扱う」方針を踏襲)。実測高さはfilterBarRef(下記useEffect参照)で
            DetailSheetの最大高さ計算にも使われる */}
        <div ref={filterBarRef} className="max-h-[30dvh] overflow-y-auto">
          <PerformerFilter
            performers={performers}
            selectedPerformerIds={selectedPerformerIds}
            onTogglePerformer={togglePerformerId}
          />
          <TagFilter tags={tags} selectedTagIds={selectedTagIds} onToggleTag={toggleTagId} />
        </div>
        <div className="relative min-h-0 flex-1">
          {/* 地図ビュー: モバイルでは「地図」タブ選択時のみ表示(CSSのhiddenで切り替え、
              PublicMap自体はアンマウントしない。タスク3-5コメント参照)。デスクトップでは常に表示 */}
          <div className={`absolute inset-0 ${activeMobileTab === "videos" ? "hidden" : ""} md:block`}>
            <PublicMap
              shops={filteredShops}
              onShopClick={setSelectedShopId}
              onBackgroundClick={closeDetailSheet}
              highlightedShopIds={highlightedShopIds}
            />
            {loadError !== null && (
              <p
                data-testid="public-map-error"
                className="absolute left-4 top-4 z-10 rounded bg-red-50 px-3 py-2 text-sm text-red-700 shadow dark:bg-red-950 dark:text-red-300"
              >
                {loadError}
              </p>
            )}
          </div>
          {/* モバイル専用の動画一覧ビュー: 「動画一覧」タブ選択時のみ表示。デスクトップでは常に非表示 */}
          <div
            className={`absolute inset-0 md:hidden ${activeMobileTab === "videos" ? "" : "hidden"}`}
          >
            <MobileVideoList
              videos={sortedVideos}
              selectedVideoId={selectedVideoId}
              onVideoClick={handleVideoClick}
            />
          </div>
        </div>
      </div>
      <MobileTabBar activeTab={activeMobileTab} onSelectTab={setActiveMobileTab} />
      <DetailSheet
        shop={selectedShop}
        visitDetails={selectedShopVisitDetails}
        performers={performers}
        tags={tags}
        filterBarHeightPx={filterBarHeightPx}
        onClose={closeDetailSheet}
      />
      <FirstView />
    </main>
  );
}
