"use client";

/**
 * 動画単位のレビュー・承認画面(/admin/review/[videoId]、タスク4-4: 管理画面
 * 取り込み実行とレビューUI)。
 *
 * requirements.md「5. AI自動抽出パイプライン(Phase 4)」2026-09-23決定の
 * 「レビュー・承認は動画単位でまとめて行う。1本の動画から作られた下書き
 * (動画・店舗・訪問)を1画面で確認・修正し、1回の承認で全部 published にする。
 * 座標未確定の店舗や未割り当ての出演者が残っている間は承認できない」に対応する。
 *
 * データ取得: visits コレクションには「動画1本分」を絞り込むクエリ関数が無いため、
 * 他admin画面(/admin/visits等)と同じ「一覧取得→クライアント側でfilter」方式を踏襲する
 * (このアプリの管理データ規模ではFirestoreクエリの追加コストに見合わない)。
 * 店舗一覧は、この動画の訪問が参照するshopId(重複除去・初出順)のみを対象にする。
 *
 * 承認可否判定は src/lib/review/approval.ts の checkVideoDraftApproval(純粋関数)に
 * 委譲する。承認操作: video→published、この動画の訪問が参照する店舗のうち
 * まだdraftのもの→published、この動画の訪問→publishedの順に更新する
 * (既にpublishedの店舗=既存店舗を再利用したケースは更新しない。
 * requirements.md「既存published店舗を再利用した訪問はその店舗を変更しない」)。
 */
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";

import { ReviewApprovalPanel } from "@/components/admin/review/ReviewApprovalPanel";
import { ReviewShopCard } from "@/components/admin/review/ReviewShopCard";
import { ReviewVisitCard } from "@/components/admin/review/ReviewVisitCard";
import { SuccessMessage } from "@/components/admin/SuccessMessage";
import { checkVideoDraftApproval } from "@/lib/review/approval";
import { useTransientMessage } from "@/lib/use-transient-message";
import { buildYoutubeThumbnailUrl } from "@/lib/youtube";
import { listPerformers } from "@/repositories/performers";
import { listShops, updateShop } from "@/repositories/shops";
import { listVideos, updateVideo } from "@/repositories/videos";
import { listVisits, updateVisit } from "@/repositories/visits";
import type { Performer } from "@/types/performer";
import type { Shop } from "@/types/shop";
import type { Video } from "@/types/video";
import type { Visit } from "@/types/visit";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** この動画の訪問が参照するshopIdのみを初出順・重複除去して取り出す */
function shopsForVisits(allShops: Shop[], visits: Visit[]): Shop[] {
  const shopById = new Map(allShops.map((shop) => [shop.id, shop]));
  const seen = new Set<string>();
  const result: Shop[] = [];
  for (const visit of visits) {
    if (seen.has(visit.shopId)) {
      continue;
    }
    const shop = shopById.get(visit.shopId);
    if (shop !== undefined) {
      seen.add(visit.shopId);
      result.push(shop);
    }
  }
  return result;
}

export default function AdminReviewVideoPage(props: PageProps<"/admin/review/[videoId]">) {
  const { videoId } = use(props.params);

  const [video, setVideo] = useState<Video | null | undefined>(undefined);
  const [shops, setShops] = useState<Shop[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const { message: successMessage, show: showSuccess } = useTransientMessage();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [allVideos, allShops, allVisits, allPerformers] = await Promise.all([
        listVideos(),
        listShops(),
        listVisits(),
        listPerformers(),
      ]);
      if (!mountedRef.current) {
        return;
      }
      const targetVideo = allVideos.find((item) => item.id === videoId) ?? null;
      const videoVisits = allVisits.filter((visit) => visit.videoId === videoId);
      setVideo(targetVideo);
      setVisits(videoVisits);
      setShops(shopsForVisits(allShops, videoVisits));
      setPerformers([...allPerformers].sort((a, b) => a.order - b.order));
      setLoadError(null);
    } catch (error) {
      if (mountedRef.current) {
        setLoadError(`データの取得に失敗しました: ${errorMessage(error)}`);
      }
    }
  }, [videoId]);

  // マウント時の初回読み込み。react-hooks/set-state-in-effect(useEffect内で
  // 直接/間接にsetStateを呼ぶことを禁じるlintルール)を満たすため、reload()
  // (内部でtry/catchによりawait前後どちらでもsetStateしうる)を呼び出すのではなく、
  // Promiseチェーンを直接組み立ててsetStateはすべて.then()/.catch()の中でのみ行う
  // (他admin画面の初回読み込みeffectと同じ設計。reload自体はShop/VisitカードのonSaved
  // コールバックやhandleApprove(いずれもuseEffect外)から呼ばれる)。
  useEffect(() => {
    Promise.all([listVideos(), listShops(), listVisits(), listPerformers()])
      .then(([allVideos, allShops, allVisits, allPerformers]) => {
        if (!mountedRef.current) {
          return;
        }
        const targetVideo = allVideos.find((item) => item.id === videoId) ?? null;
        const videoVisits = allVisits.filter((visit) => visit.videoId === videoId);
        setVideo(targetVideo);
        setVisits(videoVisits);
        setShops(shopsForVisits(allShops, videoVisits));
        setPerformers([...allPerformers].sort((a, b) => a.order - b.order));
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setLoadError(`データの取得に失敗しました: ${errorMessage(error)}`);
        }
      });
  }, [videoId]);

  async function handleApprove(): Promise<void> {
    const approval = checkVideoDraftApproval(shops, visits);
    if (!approval.canApprove) {
      return;
    }
    setApproveError(null);
    setApproving(true);
    try {
      await updateVideo(videoId, { status: "published" });
      for (const shop of shops) {
        if (shop.status !== "published") {
          await updateShop(shop.id, { status: "published" });
        }
      }
      for (const visit of visits) {
        if (visit.status !== "published") {
          await updateVisit(visit.id, { status: "published" });
        }
      }
      showSuccess("承認して公開しました");
      await reload();
    } catch (error) {
      setApproveError(`承認処理に失敗しました: ${errorMessage(error)}`);
    } finally {
      if (mountedRef.current) {
        setApproving(false);
      }
    }
  }

  if (video === undefined) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>;
  }

  if (video === null) {
    return (
      <div className="flex flex-col gap-3">
        <p data-testid="review-video-not-found" className="text-sm text-red-600 dark:text-red-400">
          指定された動画が見つかりませんでした
        </p>
        <Link href="/admin/review" className="text-sm text-blue-600 underline dark:text-blue-400">
          下書き一覧へ戻る
        </Link>
      </div>
    );
  }

  const approval = checkVideoDraftApproval(shops, visits);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildYoutubeThumbnailUrl(video.id)}
          alt={video.title}
          className="h-16 w-28 rounded object-cover"
        />
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{video.title}</h1>
          <p data-testid="review-video-status" className="text-sm text-zinc-500 dark:text-zinc-400">
            ステータス: {video.status === "published" ? "公開" : "下書き"}
          </p>
        </div>
      </div>

      <SuccessMessage testId="review-success" message={successMessage} />

      {loadError !== null && (
        <p data-testid="review-load-error" className="text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">店舗</h2>
        {shops.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">紐づく店舗はありません</p>
        )}
        {shops.map((shop) => (
          <ReviewShopCard key={shop.id} shop={shop} onSaved={() => void reload()} />
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">訪問(飲食メニュー)</h2>
        {visits.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">紐づく訪問はありません</p>
        )}
        {visits.map((visit) => (
          <ReviewVisitCard
            key={visit.id}
            visit={visit}
            shopName={shops.find((shop) => shop.id === visit.shopId)?.name ?? visit.shopId}
            performers={performers}
            onSaved={() => void reload()}
          />
        ))}
      </div>

      {video.status === "published" ? (
        <p data-testid="review-already-published" className="text-sm text-zinc-500 dark:text-zinc-400">
          この動画は既に公開済みです
        </p>
      ) : (
        <ReviewApprovalPanel
          approval={approval}
          approving={approving}
          onApprove={() => {
            void handleApprove();
          }}
        />
      )}
      {approveError !== null && (
        <p data-testid="review-approve-error" className="text-sm text-red-600 dark:text-red-400">
          {approveError}
        </p>
      )}
    </div>
  );
}
