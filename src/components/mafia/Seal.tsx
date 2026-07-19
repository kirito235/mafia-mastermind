import { useEffect, useRef, useState } from "react";

type Props = {
  onComplete: () => void;
  label?: string;
  durationMs?: number;
};

/**
 * Press-and-hold wax seal. Fires onComplete when held for `durationMs`.
 * Cancels on pointer up/leave. Progress rendered as a conic gradient ring.
 */
export function Seal({ onComplete, label = "Press &\nhold to\nbreak seal", durationMs = 650 }: Props) {
  const [pct, setPct] = useState(0);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const start = () => {
    if (fired.current) return;
    startRef.current = Date.now();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (startRef.current == null) return;
      const p = Math.min(100, ((Date.now() - startRef.current) / durationMs) * 100);
      setPct(p);
      if (p >= 100 && !fired.current) {
        fired.current = true;
        if (timerRef.current) window.clearInterval(timerRef.current);
        onComplete();
      }
    }, 16);
  };
  const cancel = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (!fired.current) setPct(0);
    startRef.current = null;
  };

  return (
    <div className="relative" style={{ width: 180, height: 180 }}>
      <div
        className="mc-seal"
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
      >
        <span style={{ whiteSpace: "pre-line" }}>{label}</span>
        <div className="mc-seal-progress" style={{ ["--p" as string]: pct } as React.CSSProperties} />
      </div>
    </div>
  );
}
