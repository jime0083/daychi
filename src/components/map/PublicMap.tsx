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
 *
 * タスク3-2(スライドアップ詳細シート)での追加:
 * - onShopClick: ピンクリック時に呼ばれるコールバック(呼び出し側で詳細シートを開く)。
 *   Marker要素はMapLibreにより地図キャンバスの兄弟要素としてcanvas-container配下に
 *   追加される(canvas自体の子ではない)ため、ピンクリックが地図本体のclickイベントとして
 *   二重発火することは基本的にないが、念のためstopPropagationしてから呼び出す。
 * - onShopClick/onBackgroundClickの参照はrefで保持し、shops配列が変わらない限り
 *   effectを再実行しない(呼び出し側がインラインの無名関数を渡しても安全なようにする)。
 *
 * タスク3-3(サイドバー動画一覧)での追加:
 * - highlightedShopIds: サイドバーで動画をクリックした際、その動画で紹介された店舗の
 *   ピンをハイライト表示するための店舗ID一覧(呼び出し側がsrc/lib/video-shop.tsの
 *   resolveVideoShopIdsで算出する)。空配列/未指定時はハイライトなし。
 * - 設計上の注意: ピン生成・初期fitBounds(店舗一覧の変化に伴うもの)を行うeffectは、
 *   意図的に依存配列を `[shops]` のみに保つ(highlightedShopIdsを含めない)。
 *   呼び出し側(src/app/page.tsx)ではhighlightedShopIdsは
 *   `selectedVideoId === null ? [] : ...` というuseMemoで算出しており、
 *   選択中の動画が無くても(内容が空のまま)visits等の依存先が更新される都度、
 *   新しい空配列の参照が生成されうる。これをこの下のfitBounds用effectの依存に含めると、
 *   「見た目上は同じ(空の)ハイライト状態」であるにもかかわらずeffectが再実行され、
 *   短時間に複数回fitBoundsが呼ばれてMapLibreの内部状態(投影計算)が不安定になり、
 *   ピンの座標がずれる不具合を引き起こすことを確認した。そのため
 *   ハイライトの反映(DOM属性・見た目の更新)と地図フォーカス(flyTo/fitBounds)は、
 *   ピン生成・初期fitBoundsとは完全に別のeffectとして分離し、既存markerの要素を
 *   直接更新するだけに留める(マーカーの再生成・カメラの再フィットは行わない)。
 * - ハイライトの見た目: 通常ピンと視覚的に区別するため、要素のCSS filterを変更する
 *   (SVG内部のfill色を直接書き換えるより単純で、MapLibreが管理するtransform
 *   (位置決め)スタイルとは独立して指定できるため)。
 * - 決定的なE2E検証のため、各Marker要素に data-highlighted="true"/"false" を
 *   必ず付与する(色の見た目に頼らずDOM属性で検証できるようにするため)。
 * - highlightedShopIdsが変化した際、対象の店舗が1件ならその店舗を中心にflyTo、
 *   複数件なら全店舗が収まるようfitBoundsする(該当店舗が複数動画で紹介されている
 *   ケースへの対応。「代表1店舗にフォーカス」ではなく「全店舗が収まるようフィット」を
 *   採用する。理由: 一部の店舗だけが画面外になり見落とされることを避けるため)。
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAP_FIT_BOUNDS_PADDING,
  MAP_PIN_HIGHLIGHT_FILTER,
  MAP_STYLE_URL,
} from "@/lib/map-config";
import type { Shop } from "@/types/shop";

/** ピンのMarker要素に付与するdata-testid(E2Eで page.getByTestId(MAP_PIN_TEST_ID) 等に使用) */
export const MAP_PIN_TEST_ID = "map-pin";

interface PublicMapProps {
  /** 地図にピン表示する店舗一覧。取得中は空配列を渡すこと(0件フォールバック表示になる) */
  shops: Shop[];
  /** ピンクリック時に呼ばれるコールバック(タスク3-2: 詳細シートを開く用途) */
  onShopClick?: (shopId: string) => void;
  /** ピン以外の地図背景クリック時に呼ばれるコールバック(タスク3-2: 詳細シートを閉じる用途) */
  onBackgroundClick?: () => void;
  /**
   * ハイライト表示(かつ地図フォーカス)対象の店舗ID一覧(タスク3-3)。
   * 空配列/未指定の場合は通常表示・フォーカスなし
   */
  highlightedShopIds?: string[];
}

/** マーカー要素にハイライト状態(data属性・見た目)を反映する */
function applyHighlightState(marker: maplibregl.Marker, highlightedShopIds: string[]): void {
  const element = marker.getElement();
  const shopId = element.dataset.shopId;
  const isHighlighted = shopId !== undefined && highlightedShopIds.includes(shopId);
  element.dataset.highlighted = isHighlighted ? "true" : "false";
  element.style.filter = isHighlighted ? MAP_PIN_HIGHLIGHT_FILTER : "";
}

export function PublicMap({
  shops,
  onShopClick,
  onBackgroundClick,
  highlightedShopIds = [],
}: PublicMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // 最新のコールバック/ハイライト対象をrefで保持する(下のeffectの依存配列に含めないことで、
  // 呼び出し側がインラインの無名関数を渡しても地図/ピンの再生成が起きないようにする。
  // highlightedShopIdsRefは、ピン生成時に初期ハイライト状態を反映するために使う)
  const onShopClickRef = useRef(onShopClick);
  useEffect(() => {
    onShopClickRef.current = onShopClick;
  }, [onShopClick]);

  const onBackgroundClickRef = useRef(onBackgroundClick);
  useEffect(() => {
    onBackgroundClickRef.current = onBackgroundClick;
  }, [onBackgroundClick]);

  const highlightedShopIdsRef = useRef(highlightedShopIds);

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
    map.on("click", () => {
      onBackgroundClickRef.current?.();
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // shopsの変更をピン表示・表示範囲に反映する(タスク3-1と同じ依存配列 [shops] のみ。
  // 上のコメント「設計上の注意」の通り、highlightedShopIdsはここに含めない)
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
      element.style.cursor = "pointer";
      // ピンクリックで詳細シートを開く(タスク3-2)。地図本体のclickイベント
      // (背景クリックで閉じる用途)への伝播を止めてから呼び出す
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onShopClickRef.current?.(shop.id);
      });
      // タスク3-3: 生成時点の最新のハイライト対象を反映しておく
      // (highlightedShopIdsRef.current。この後のハイライト同期effectでも継続的に更新される)
      applyHighlightState(marker, highlightedShopIdsRef.current);
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

  // タスク3-3: highlightedShopIdsが変化した時、既存マーカー要素のハイライト状態
  // (data属性・見た目)のみを更新する。マーカーの再生成・カメラの移動は行わない
  // (カメラの移動は下の別effectが担当する)
  useEffect(() => {
    highlightedShopIdsRef.current = highlightedShopIds;
    markersRef.current.forEach((marker) => applyHighlightState(marker, highlightedShopIds));
  }, [highlightedShopIds]);

  // タスク3-3: highlightedShopIdsが変化した時(=サイドバーで動画がクリックされた時)、
  // 対象店舗にカメラをフォーカスする。1件ならflyTo、複数件なら全店舗が収まるようfitBoundsする
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || highlightedShopIds.length === 0) {
      return;
    }

    const targetShops = shops.filter((shop) => highlightedShopIds.includes(shop.id));
    if (targetShops.length === 0) {
      return;
    }

    if (targetShops.length === 1) {
      map.flyTo({
        center: [targetShops[0].location.lng, targetShops[0].location.lat],
        zoom: DEFAULT_MAP_ZOOM,
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    targetShops.forEach((shop) => {
      bounds.extend([shop.location.lng, shop.location.lat]);
    });
    map.fitBounds(bounds, {
      padding: MAP_FIT_BOUNDS_PADDING,
      maxZoom: DEFAULT_MAP_ZOOM,
    });
  }, [highlightedShopIds, shops]);

  return <div ref={containerRef} data-testid="public-map" className="h-full w-full" />;
}
