"use client";

/**
 * 店舗の緯度経度をMapLibre GL地図上のピン操作(クリック/ドラッグ)で指定するための
 * 管理画面向けコンポーネント(タスク2-4: 店舗登録CRUD)。
 *
 * 設計判断:
 * - MapLibreはブラウザAPI(window/document)を前提とするため、Next.jsのSSR環境で
 *   このモジュールが評価されると失敗しうる。呼び出し側(/admin/shops)で
 *   next/dynamic(..., { ssr: false }) を使い、クライアントサイドでのみこの
 *   コンポーネントをマウントする設計とする(このファイル自身はサーバーでは
 *   renderされない前提)。
 * - 緯度経度の実際の確定はこのコンポーネント外(呼び出し側)の数値入力欄でも
 *   行える設計とする。E2Eでの座標指定は数値入力欄側で決定的に行い、地図の
 *   クリック/ドラッグ操作はあくまでUI補助という位置づけにする
 *   (地図タイルは外部ネットワーク依存のためE2Eをflakyにしないため)。
 * - このコンポーネントは location props を表示し、ユーザー操作(クリック/ドラッグ)を
 *   onChangeで呼び出し側に通知するだけの制御コンポーネントとする(自身では状態を持たない)。
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

import { DEFAULT_MAP_ZOOM, MAP_STYLE_URL } from "@/lib/map-config";
import type { GeoLocation } from "@/types/common";

interface ShopLocationPickerProps {
  location: GeoLocation;
  onChange: (location: GeoLocation) => void;
}

/**
 * 2つの座標がほぼ同一とみなせるか判定する。
 * 呼び出し側(数値入力欄)の変更をマーカーに反映するeffectで、
 * マーカー自身の操作(dragend/click)によって発生したprops変更を再度
 * マーカーへ書き戻す無限ループを避けるために使う。
 */
function isSameLocation(a: GeoLocation, b: GeoLocation): boolean {
  const EPSILON = 1e-9;
  return Math.abs(a.lat - b.lat) < EPSILON && Math.abs(a.lng - b.lng) < EPSILON;
}

export function ShopLocationPicker({ location, onChange }: ShopLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // イベントハンドラから常に最新のonChangeを参照するためのref。
  // これによりonChangeの変化のたびに地図/マーカーを作り直す必要がなくなる
  // (refへの書き込みはレンダー中に行えないため、effect内で更新する)
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // 初期化時の中心位置(マウント後のlocation変更は別のeffectで追随するため、
  // この値自体が変わってもマップを再生成する必要はない)
  const initialLocationRef = useRef(location);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }

    const initialLocation = initialLocationRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [initialLocation.lng, initialLocation.lat],
      zoom: DEFAULT_MAP_ZOOM,
    });
    const marker = new maplibregl.Marker({ draggable: true })
      .setLngLat([initialLocation.lng, initialLocation.lat])
      .addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLngLat();
      onChangeRef.current({ lat, lng });
    });
    map.on("click", (event) => {
      const { lat, lng } = event.lngLat;
      marker.setLngLat([lng, lat]);
      onChangeRef.current({ lat, lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // マウント時に一度だけ地図/マーカーを初期化する。以降の座標変更は
    // 下のeffect(locationの変更を購読)でマーカー位置に反映する
  }, []);

  // 呼び出し側(緯度経度の数値入力欄など)でのlocation変更をマーカー位置・
  // 地図中心に反映する
  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (marker === null || map === null) {
      return;
    }
    const current = marker.getLngLat();
    if (isSameLocation({ lat: current.lat, lng: current.lng }, location)) {
      return;
    }
    marker.setLngLat([location.lng, location.lat]);
    map.setCenter([location.lng, location.lat]);
  }, [location]);

  return (
    <div
      ref={containerRef}
      data-testid="shop-location-map"
      className="h-64 w-full overflow-hidden rounded border border-zinc-300 dark:border-zinc-700"
    />
  );
}
