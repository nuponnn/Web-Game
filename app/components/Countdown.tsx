"use client";
import { useEffect, useRef, useState } from "react";
import { useServerTimeOffset } from "../lib/useServerTime";

interface CountdownProps {
  endsAt: number;
  onExpire?: () => void;
}

export function Countdown({ endsAt, onExpire }: CountdownProps) {
  const offset = useServerTimeOffset();
  const [remainingMs, setRemainingMs] = useState(() => endsAt - Date.now());
  const [hasExpired, setHasExpired] = useState(false);

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (hasExpired) return;

    const tick = () => {
      const serverNow = Date.now() + offset;
      const remaining = Math.max(0, endsAt - serverNow);
      setRemainingMs(remaining);

      if (remaining <= 0) {
        setHasExpired(true);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, offset, hasExpired]);

  useEffect(() => {
    if (hasExpired) onExpireRef.current?.();
  }, [hasExpired]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (hasExpired) {
    return (
      <p className="text-lg font-bold text-danger">หมดเวลา!</p>
    );
  }

  return (
    <p className="text-3xl font-bold tabular-nums tracking-tight text-text">
      {minutes}:{String(seconds).padStart(2, "0")}
    </p>
  );
}
