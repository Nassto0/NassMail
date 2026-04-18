"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

type MenuState = { x: number; y: number; items: ContextMenuItem[] };

export function ContextMenuLayer({
  state,
  onClose,
}: {
  state: MenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState({ dx: 0, dy: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) {
      setShift({ dx: 0, dy: 0 });
      return;
    }
    const el = ref.current;
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right > window.innerWidth - 8) dx = window.innerWidth - 8 - r.right;
    if (r.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - r.bottom;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (r.top + dy < 8) dy = 8 - r.top;
    setShift({ dx, dy });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  useEffect(() => {
    if (!state) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [state, onClose]);

  if (!state || typeof document === "undefined") return null;

  const { x, y, items } = state;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] min-w-[200px] max-w-[280px] surface rounded-xl shadow-pop border border-token py-1 anim-scale"
      style={{ left: x + shift.dx, top: y + shift.dy }}>
      {items.map((item) => (
        <div key={item.key}>
          {item.separatorBefore && <div className="my-1 h-px bg-[color:var(--border)]" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-sm text-start hover:surface-hover disabled:opacity-40 disabled:pointer-events-none",
              item.danger ? "text-danger" : "text-token",
            )}>
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
