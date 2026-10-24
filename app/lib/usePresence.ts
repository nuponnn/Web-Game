"use client";
import { useEffect } from "react";
import {
  ref,
  onDisconnect,
  update,
  remove,
  get,
  serverTimestamp,
} from "firebase/database";
import { rldb } from "./firebase";

export function usePresence(
  roomId: string | null,
  uid: string | null | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !roomId || !uid) return;

    const presenceRef = ref(rldb, `presence/${roomId}/${uid}`);
    const playerRef = ref(rldb, `rooms/${roomId}/players/${uid}`);
    const rootRef = ref(rldb);
    const disconnect = onDisconnect(rootRef);
    let cancelled = false;

    async function register() {
      await disconnect.update({
        [`presence/${roomId}/${uid}`]: null,
        [`rooms/${roomId}/players/${uid}/online`]: false,
        [`rooms/${roomId}/players/${uid}/lastOfflineAt`]: serverTimestamp(),
      });
      if (cancelled) return;
      await update(rootRef, {
        [`presence/${roomId}/${uid}`]: true,
        [`rooms/${roomId}/players/${uid}/online`]: true,
      });
    }

    register().catch((err) => {
      if (!cancelled) console.error("usePresence error:", err);
    });

    return () => {
      cancelled = true;
      disconnect.cancel();
      remove(presenceRef).catch(() => {});

      // เขียน offline เฉพาะเมื่อ player ยังอยู่ (กันเขียนลง node ที่ leaveRoom ลบไปแล้ว)
      get(playerRef)
        .then((snap) => {
          if (!snap.exists()) return;
          return update(rootRef, {
            [`rooms/${roomId}/players/${uid}/online`]: false,
            [`rooms/${roomId}/players/${uid}/lastOfflineAt`]: serverTimestamp(),
          });
        })
        .catch(() => {});
    };
  }, [roomId, uid, enabled]);
}