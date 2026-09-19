"use client";

/**
 * 公開トップページ(/)の全画面地図コンポーネント(タスク3-1: 地図表示とピン)。
 *
 * requirements.md「3.1 公開ページ」に基づき、MapLibre GL JS + OpenFreeMap
 * (src/lib/map-config.ts)で地図を全画面表示し、渡された店舗(published店舗のみである
 * ことは呼び出し側の責務。listPublishedShops経由で取得したものを渡すこと)をピン表示する。
 *
 * 設計判断:
 * - MapLibreはブラウザAPI(window/document)を前提とするため、Next.jsのSSR環境で
 *   このモジュールが評価されると失敗しうる。呼び出し側(src/app/page.tsx)で
 *   next/dynamic(..., { ssr: false }) を使い、クライアントサイドでのみこの
 *   コンポーネントをマウントする設計とする(ShopLocationPicker.tsxと同じ方針)。
 * - このコンポーネントは shops props を表示するだけの制御コンポーネントとし、
 *   Firestoreからの取得(listPublishedShops呼び出し)や絞り込み(Phase 3後続タスクの
 *   出演者フィルタ・動画一覧クリックによるフォーカス等)は呼び出し側の責務とする。
 *   これによりPhase 3の後続タスク(3-2詳細シート、3-3サイドバー、3-4出演者フィルタ)で
 *   「表示するshopsの配列を絞り込む/クリックハンドラを追加する」形で再利用しやすくする。
 * - 各ピン(Marker)のDOM要素には data-testid="map-pin" と data-shop-id を付与する。
 *   地図タイル(外部ネットワーク依存)の描画結果に頼らずE2Eで決定的にピンの存在を
 *   検証できるようにするため(e2e/public-map.spec.ts参照)。
 * - 初期表示は渡された全ピンが収まる範囲にfitBoundsする。店舗が0件の場合は
 *   デフォルト中心(DEFAULT_MAP_CENTER)・デフォルトズーム(DEFAULT_MAP_ZOOM)に
 *   フォールバックする。
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAP_FIT_BOUNDS_PADDING,
  MAP_STYLE_URL,
} from "@/lib/map-config";
import type { Shop } from "@/types/shop";

/** ピンのMarker要素に付与するdata-testid(E2Eで page.getByTestId(MAP_PIN_TEST_ID) 等に使用) */
export const MAP_PIN_TEST_ID = "map-pin";

interface PublicMapProps {
  /** 地図にピン表示する店舗一覧。取得中は空配列を渡すこと(0件フォールバック表示になる) */
  shops: Shop[];
}

export function PublicMap({ shops }: PublicMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // 地図本体の初期化(マウント時に一度だけ)。中心・ズームの初期値はダミーで、
  // 実際の表示範囲は下のeffect(shopsを購読)でfitBounds/setCenterにより確定する
  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat],
      zoom: DEFAULT_MAP_ZOOM,
    });
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // shopsの変更をピン表示・表示範囲に反映する
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }

    // 直前のピンを全て取り除いてから作り直す(店舗一覧全体を毎回作り直すシンプルな設計。
    // Phase 3-1時点では初回ロード時にしか変化しないため、差分更新の複雑さは導入しない)
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = shops.map((shop) => {
      const marker = new maplibregl.Marker()
        .setLngLat([shop.location.lng, shop.location.lat])
        .addTo(map);
      const element = marker.getElement();
      element.dataset.testid = MAP_PIN_TEST_ID;
      element.dataset.shopId = shop.id;
      element.setAttribute("aria-label", shop.name);
      return marker;
    });

    if (shops.length === 0) {
      map.setCenter([DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_CENTER.lat]);
      map.setZoom(DEFAULT_MAP_ZOOM);
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    shops.forEach((shop) => {
      bounds.extend([shop.location.lng, shop.location.lat]);
    });
    map.fitBounds(bounds, {
      padding: MAP_FIT_BOUNDS_PADDING,
      // ピンが1件のみの場合、fitBoundsは際限なくズームインしうるため、
      // 店舗登録時の初期ズーム(DEFAULT_MAP_ZOOM)を上限として再利用する
      maxZoom: DEFAULT_MAP_ZOOM,
      duration: 0,
    });
  }, [shops]);

  return <div ref={containerRef} data-testid="public-map" className="h-full w-full" />;
}
