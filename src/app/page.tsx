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
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { DetailSheet } from "@/components/map/DetailSheet";
import { resolveShopVisitDetails } from "@/lib/shop-detail";
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

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) ?? null,
    [shops, selectedShopId],
  );

  const selectedShopVisitDetails = useMemo(
    () => (selectedShop === null ? [] : resolveShopVisitDetails(selectedShop.id, visits, videos)),
    [selectedShop, visits, videos],
  );

  function closeDetailSheet(): void {
    setSelectedShopId(null);
  }

  return (
    <main data-testid="public-map-page" className="relative h-dvh w-full overflow-hidden">
      <PublicMap
        shops={shops}
        onShopClick={setSelectedShopId}
        onBackgroundClick={closeDetailSheet}
      />
      {loadError !== null && (
        <p
          data-testid="public-map-error"
          className="absolute left-4 top-4 z-10 rounded bg-red-50 px-3 py-2 text-sm text-red-700 shadow dark:bg-red-950 dark:text-red-300"
        >
          {loadError}
        </p>
      )}
      <DetailSheet
        shop={selectedShop}
        visitDetails={selectedShopVisitDetails}
        performers={performers}
        onClose={closeDetailSheet}
      />
    </main>
  );
}
