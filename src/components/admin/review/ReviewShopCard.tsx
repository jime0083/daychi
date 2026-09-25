"use client";

/**
 * レビュー画面(/admin/review/[videoId])の店舗1件分の表示・修正カード(タスク4-4)。
 *
 * requirements.md「3.2 管理画面」「4. データモデル」shops に基づき、店名・住所・
 * 営業時間・情報基準日を編集できる。座標(location)は
 * shop.locationConfirmed === false の場合のみ編集UIを表示する
 * (「住所からピンを立てる」ボタン+地図クリック/ドラッグ+「この座標で確定する」ボタン)。
 * 確定済み(locationConfirmed !== false)の座標調整は/admin/shopsの既存編集フォームの
 * 責務とし、このカードでは行わない(レビュー画面は承認をブロックしている問題の解消に
 * 焦点を当てる設計)。
 *
 * MapLibreはSSR非対応のため、呼び出し元(ReviewVideoDraft)ではなくこのファイル自身が
 * next/dynamicで`{ ssr: false }`指定してShopLocationPickerを読み込む
 * (src/app/admin/shops/page.tsxと同じ設計判断。責務がこのカードに閉じているため)。
 *
 * 状態管理の設計判断: 親から渡されるshopが変わったときにフォームstateを
 * useEffectでリセットする実装は「setStateをuseEffect内で直接呼ぶ」react-hooks
 * lintルール(set-state-in-effect)に抵触するため採用しない。このカード自身以外が
 * 同じ店舗の name/address/businessHours/infoAsOf を書き換えることはないため、
 * useState の遅延初期化(shopの初期値のみ)と親側の`key={shop.id}`(店舗切替時の
 * 再マウント)だけで十分に整合性が保てる。locationConfirmedの表示切替は
 * ローカルstateを介さず常にpropsのshop.locationConfirmedを直接参照する。
 *
 * タグ付与(タスク5-2、requirements.md「3.2 管理画面」2026-09-24決定): 店舗管理画面
 * (/admin/shops)と同じTagCheckboxList(src/components/admin/TagCheckboxList.tsx)を
 * 表示し、「店舗情報を保存」ボタンを押した時にtagIdsもまとめて保存する。承認処理
 * (親ページのhandleApprove)はtagIdsを一切書き換えない(既存published店舗を
 * 再利用したカードでも、管理者が保存を押した時だけ書き込む設計を維持)。
 */
import { Timestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { useState } from "react";

import { TagCheckboxList } from "@/components/admin/TagCheckboxList";
import { useAdminAuth } from "@/lib/admin-auth";
import { geocodeAddress } from "@/lib/admin-geocode-client";
import { updateShop } from "@/repositories/shops";
import type { GeoLocation } from "@/types/common";
import type { Shop } from "@/types/shop";
import type { Tag } from "@/types/tag";

const ShopLocationPicker = dynamic(
  () => import("@/components/admin/ShopLocationPicker").then((mod) => mod.ShopLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="review-shop-location-map-loading"
        className="flex h-64 w-full items-center justify-center rounded border border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      >
        地図を読み込み中...
      </div>
    ),
  },
);

interface ShopInfoFormState {
  name: string;
  address: string;
  businessHours: string;
  infoAsOf: string; // <input type="date"> の値(YYYY-MM-DD)
  tagIds: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function timestampToDateInputValue(timestamp: Timestamp): string {
  const date = timestamp.toDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string): Timestamp | null {
  if (value.trim() === "") {
    return null;
  }
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function toFormState(shop: Shop): ShopInfoFormState {
  return {
    name: shop.name,
    address: shop.address,
    businessHours: shop.businessHours,
    infoAsOf: timestampToDateInputValue(shop.infoAsOf),
    tagIds: shop.tagIds ?? [],
  };
}

interface ReviewShopCardProps {
  shop: Shop;
  allTags: Tag[];
  onSaved: () => void;
}

export function ReviewShopCard({ shop, allTags, onSaved }: ReviewShopCardProps) {
  const authStatus = useAdminAuth();

  const [form, setForm] = useState<ShopInfoFormState>(() => toFormState(shop));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [location, setLocation] = useState<GeoLocation>(shop.location);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function handleSaveInfo(): Promise<void> {
    const name = form.name.trim();
    const address = form.address.trim();
    const infoAsOf = parseDateInputValue(form.infoAsOf);
    const nextErrors: string[] = [];
    if (name === "") {
      nextErrors.push("店名を入力してください");
    }
    if (address === "") {
      nextErrors.push("住所を入力してください");
    }
    if (infoAsOf === null) {
      nextErrors.push("情報基準日を入力してください");
    }
    if (nextErrors.length > 0 || infoAsOf === null) {
      setErrors(nextErrors);
      return;
    }

    setErrors([]);
    setSaving(true);
    try {
      await updateShop(shop.id, {
        name,
        address,
        businessHours: form.businessHours.trim(),
        infoAsOf,
        tagIds: form.tagIds,
      });
      onSaved();
    } catch (error) {
      setErrors([`保存に失敗しました: ${errorMessage(error)}`]);
    } finally {
      setSaving(false);
    }
  }

  async function handleGeocode(): Promise<void> {
    const address = form.address.trim();
    if (address === "") {
      setGeocodeError("住所を入力してください");
      return;
    }
    if (authStatus.state !== "signed-in") {
      setGeocodeError("認証状態を確認できませんでした。画面を再読み込みしてください");
      return;
    }
    setGeocodeError(null);
    setGeocoding(true);
    try {
      const idToken = await authStatus.user.getIdToken();
      const nextLocation = await geocodeAddress(address, idToken);
      setLocation(nextLocation);
    } catch (error) {
      setGeocodeError(errorMessage(error));
    } finally {
      setGeocoding(false);
    }
  }

  async function handleConfirmLocation(): Promise<void> {
    setConfirmError(null);
    setConfirming(true);
    try {
      await updateShop(shop.id, { location, locationConfirmed: true });
      onSaved();
    } catch (error) {
      setConfirmError(`座標の確定に失敗しました: ${errorMessage(error)}`);
    } finally {
      setConfirming(false);
    }
  }

  const locationUnconfirmed = shop.locationConfirmed === false;

  return (
    <div
      data-testid="review-shop-card"
      data-shop-id={shop.id}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      {locationUnconfirmed && (
        <p
          data-testid="review-shop-warning"
          className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          座標が未確定です。住所からピンを立てるか地図をクリック/ドラッグして位置を指定し、
          「この座標で確定する」を押してください(確定するまでこの動画は承認できません)。
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          店名
          <input
            data-testid="review-shop-name"
            type="text"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          住所
          <input
            data-testid="review-shop-address"
            type="text"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          営業時間
          <input
            data-testid="review-shop-businesshours"
            type="text"
            value={form.businessHours}
            onChange={(event) => setForm({ ...form, businessHours: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-200">
          情報基準日
          <input
            data-testid="review-shop-infoasof"
            type="date"
            value={form.infoAsOf}
            onChange={(event) => setForm({ ...form, infoAsOf: event.target.value })}
            className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="button"
          data-testid="review-shop-save"
          disabled={saving}
          onClick={() => {
            void handleSaveInfo();
          }}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {saving ? "保存中..." : "店舗情報を保存"}
        </button>
      </div>

      <TagCheckboxList
        idPrefix="review-shop"
        allTags={allTags}
        selectedTagIds={form.tagIds}
        onChange={(nextTagIds) => setForm({ ...form, tagIds: nextTagIds })}
      />

      {errors.length > 0 && (
        <ul
          data-testid="review-shop-error"
          className="flex flex-col gap-0.5 text-sm text-red-600 dark:text-red-400"
        >
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {locationUnconfirmed && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="review-shop-geocode"
              disabled={geocoding}
              onClick={() => {
                void handleGeocode();
              }}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {geocoding ? "座標を取得中..." : "住所からピンを立てる"}
            </button>
            <p
              data-testid="review-shop-location-preview"
              className="text-sm text-zinc-500 dark:text-zinc-400"
            >
              現在の座標: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
            </p>
            <button
              type="button"
              data-testid="review-shop-confirm-location"
              disabled={confirming}
              onClick={() => {
                void handleConfirmLocation();
              }}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirming ? "確定中..." : "この座標で確定する"}
            </button>
          </div>
          {geocodeError !== null && (
            <p data-testid="review-shop-geocode-error" className="text-sm text-red-600 dark:text-red-400">
              {geocodeError}
            </p>
          )}
          {confirmError !== null && (
            <p data-testid="review-shop-confirm-error" className="text-sm text-red-600 dark:text-red-400">
              {confirmError}
            </p>
          )}
          <ShopLocationPicker location={location} onChange={setLocation} />
        </div>
      )}
    </div>
  );
}
