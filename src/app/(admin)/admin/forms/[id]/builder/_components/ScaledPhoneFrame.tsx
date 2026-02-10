// src/app/(admin)/admin/forms/[id]/builder/_components/ScaledPhoneFrame.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ScaledPhoneFrame(props: {
  baseWidth?: number;   // "Design"-Breite des Phones (px)
  baseHeight?: number;  // "Design"-Höhe des Phones (px)
  maxScale?: number;    // i.d.R. 1 (nie grösser als 100%)
  minScale?: number;    // z.B. 0.5, damit es nie “zu klein” wird
  className?: string;
  children: React.ReactNode;
}) {
  const baseWidth = props.baseWidth ?? 390;
  const baseHeight = props.baseHeight ?? 844;
  const maxScale = props.maxScale ?? 1;
  const minScale = props.minScale ?? 0.45;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };

    update();

    // ResizeObserver (Browser)
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => update());
      ro.observe(el);
    }

    // Fallback: window resize
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, []);

  const scale = useMemo(() => {
    if (!box.w || !box.h) return 1;
    const sx = box.w / baseWidth;
    const sy = box.h / baseHeight;
    return clamp(Math.min(sx, sy, maxScale), minScale, maxScale);
  }, [box.w, box.h, baseWidth, baseHeight, maxScale, minScale]);

  return (
    <div ref={wrapRef} className={props.className ?? "relative h-full w-full overflow-hidden"}>
      <div className="flex h-full w-full items-start justify-center">
        <div
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}
