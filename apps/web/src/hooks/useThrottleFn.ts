"use client";
// 前沿（leading-edge）节流 Hook：用于"点击即发请求"的操作按钮，
// 防止连点/双击在短时间内触发多次重复请求。
// 语义：wait 窗口内的第一次调用立即执行，窗口期内的后续调用被直接丢弃
// （不做尾调用排队），窗口结束后恢复响应。已有 pending/disabled 保护的
// 按钮不需要再套这个 Hook。
import { useCallback, useEffect, useRef } from "react";

/**
 * 返回一个节流后的函数版本。
 * @param fn 实际要执行的函数；允许传 undefined（对应可选的回调 prop），
 *           此时节流函数调用时什么都不做。
 * @param wait 节流窗口，单位毫秒，默认 800ms（建议 600~1000ms）
 */
export function useThrottleFn<Args extends unknown[]>(
  fn: ((...args: Args) => void) | undefined,
  wait = 800,
) {
  // 始终指向最新的 fn，避免节流窗口内闭包过期读到旧的 state/props
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理未触发的定时器，避免残留计时器持续占用
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current) return; // 节流窗口内，丢弃本次调用
      fnRef.current?.(...args);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
      }, wait);
    },
    [wait],
  );
}
