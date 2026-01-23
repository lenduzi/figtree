import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.7; // px/ms (~700px/s)

type UseSheetDragOptions = {
  enabled?: boolean;
  onDismiss?: () => void;
};

export function useSheetDrag({ enabled = true, onDismiss }: UseSheetDragOptions = {}) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const startTimeRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        window.clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  const setDragging = useCallback((value: boolean) => {
    draggingRef.current = value;
    setIsDragging(value);
  }, []);

  const endDrag = useCallback(
    (shouldDismiss: boolean) => {
      if (!draggingRef.current) return;
      setDragging(false);
      setDragOffset(0);
      pointerIdRef.current = null;
      if (settleTimeoutRef.current) {
        window.clearTimeout(settleTimeoutRef.current);
      }
      if (shouldDismiss) {
        onDismiss?.();
        return;
      }
      setIsSettling(true);
      settleTimeoutRef.current = window.setTimeout(() => {
        setIsSettling(false);
      }, 200);
    },
    [onDismiss, setDragging],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || !isMobile) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerIdRef.current = event.pointerId;
      startYRef.current = event.clientY;
      lastYRef.current = 0;
      startTimeRef.current = performance.now();
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [enabled, isMobile, setDragging],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
    const delta = Math.max(0, event.clientY - startYRef.current);
    lastYRef.current = delta;
    setDragOffset(delta);
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!draggingRef.current || pointerIdRef.current !== event.pointerId) return;
      const elapsed = performance.now() - startTimeRef.current;
      const velocity = lastYRef.current / Math.max(elapsed, 1);
      const shouldDismiss = lastYRef.current > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY;
      endDrag(shouldDismiss);
    },
    [endDrag],
  );

  const onPointerCancel = useCallback(() => {
    endDrag(false);
  }, [endDrag]);

  const handleProps = enabled && isMobile
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
      }
    : {};

  return {
    dragOffset,
    isDragging,
    isSettling,
    isMobile: enabled && isMobile,
    handleProps,
  };
}
