/**
 * 保存成功時などの一時的なフィードバックメッセージを管理するフック
 * (タスク2-7: 管理画面仕上げ)。
 *
 * show(text) 呼び出しでメッセージを表示し、durationMs 経過後に自動的に消える。
 * 連続してshow()が呼ばれた場合は直前のタイマーを解除して再スタートする
 * (表示中に別の成功操作が起きても取りこぼさない)。
 */
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 4000;

export interface TransientMessage {
  message: string | null;
  show: (text: string) => void;
  clear: () => void;
}

export function useTransientMessage(durationMs: number = DEFAULT_DURATION_MS): TransientMessage {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const show = useCallback(
    (text: string) => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      setMessage(text);
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, durationMs);
    },
    [durationMs],
  );

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(null);
  }, []);

  return { message, show, clear };
}
