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
 *   selectedShopId(詳細シート用)とは独立した状態であり、互いに干渉しない
 *   (動画クリックは詳細シートを開閉しない。ピンクリックはサイドバーの選択状態を変えない)。
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
 *   含まれていても実害はない(PublicMap.tsx参照)。
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { DetailSheet } from "@/components/map/DetailSheet";
import { PerformerFilter } from "@/components/map/PerformerFilter";
import { VideoSidebar } from "@/components/map/VideoSidebar";
import { resolveShopVisitDetails } from "@/lib/shop-detail";
import { filterShopsByPerformers } from "@/lib/shop-filter";
import { resolveVideoShopIds } from "@/lib/video-shop";
import { listPerformers } from "@/repositories/performers";
import { listPublishedShops } from "@/repositories/shops";
import { listPublishedVideos } from "@/repositories/videos";
import { listPublishedVisits } from "@/repositories/visits";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Video } from "@/types/video";
import type { Visit } from "@/types/visit";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState<string[]>([]);

  // アンマウント後の setState を防ぐガード(/admin配下の各画面と同じパターン)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    Promise.all([listPublishedShops(), listPublishedVisits(), listPublishedVideos(), listPerformers()])
      .then(([shopList, visitList, videoList, performerList]) => {
        if (mountedRef.current) {
          setShops(shopList);
          setVisits(visitList);
          setVideos(videoList);
          setPerformers(performerList);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setLoadError(`店舗情報の取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, []);

  // 出演者フィルタ(タスク3-4)で選択された出演者のいずれかが参加した
  // published visitを持つ店舗のみに絞り込む(選択0件の場合は絞り込みなし=shopsそのまま)
  const filteredShops = useMemo(
    () => filterShopsByPerformers(shops, visits, selectedPerformerIds),
    [shops, visits, selectedPerformerIds],
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

  // フィルタ変更で表示対象から外れた店舗の詳細シートが開いたままにならないよう、
  // 変更後の店舗一覧に選択中の店舗が含まれなくなる場合はselectedShopIdもここで閉じる
  // (useEffectでのderiveはsetState-in-effectの警告対象になるため、イベントハンドラ内で完結させる)
  function togglePerformerId(performerId: string): void {
    const nextPerformerIds = selectedPerformerIds.includes(performerId)
      ? selectedPerformerIds.filter((id) => id !== performerId)
      : [...selectedPerformerIds, performerId];
    setSelectedPerformerIds(nextPerformerIds);

    const nextFilteredShops = filterShopsByPerformers(shops, visits, nextPerformerIds);
    if (selectedShopId !== null && !nextFilteredShops.some((shop) => shop.id === selectedShopId)) {
      setSelectedShopId(null);
    }
  }

  return (
    <main data-testid="public-map-page" className="flex h-dvh w-full overflow-hidden">
      <VideoSidebar
        videos={sortedVideos}
        selectedVideoId={selectedVideoId}
        onVideoClick={setSelectedVideoId}
      />
      <div className="relative h-full flex-1">
        <PublicMap
          shops={filteredShops}
          onShopClick={setSelectedShopId}
          onBackgroundClick={closeDetailSheet}
          highlightedShopIds={highlightedShopIds}
        />
        <PerformerFilter
          performers={performers}
          selectedPerformerIds={selectedPerformerIds}
          onTogglePerformer={togglePerformerId}
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
      <DetailSheet
        shop={selectedShop}
        visitDetails={selectedShopVisitDetails}
        performers={performers}
        onClose={closeDetailSheet}
      />
    </main>
  );
}
