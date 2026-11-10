import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { centsToInput, parseMoneyInput } from "../lib/money";
import type { Person } from "../lib/types";

/**
 * Keeps an overlay inside the part of the screen you can actually see. On
 * phones the on-screen keyboard covers the bottom of the page without
 * resizing it, so a bottom sheet would sit behind the keyboard. Matching the
 * visual viewport puts the sheet (and the field you're typing in) just above
 * the keyboard instead.
 */
function useFitToVisibleArea(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = "auto";
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [ref]);
}

export function Modal({
  title,
  onClose,
  children,
  tone,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  tone?: "warn";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  useFitToVisibleArea(backdropRef);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Runs once per open: Escape to close, initial focus, and focus restore.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the first input if there is one, otherwise the panel itself.
    const first = panelRef.current?.querySelector<HTMLElement>("input, textarea");
    (first ?? panelRef.current)?.focus();
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div ref={backdropRef} className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={`modal ${tone === "warn" ? "modal-warn" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ person, size = 28 }: { person: Person; size?: number }) {
  const initial = person.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `var(--p${person.color})` }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Text input for money that tolerates partial typing like "12." or "$". */
export function MoneyInput({
  cents,
  onChange,
  label,
  className,
}: {
  cents: number;
  onChange: (cents: number) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(centsToInput(cents));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(centsToInput(cents));
  }, [cents, focused]);

  return (
    <span className={`money-input ${className ?? ""}`}>
      <span className="money-prefix" aria-hidden="true">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          setText(centsToInput(cents));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseMoneyInput(e.target.value);
          onChange(parsed ?? 0);
        }}
      />
    </span>
  );
}

const ICONS = {
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 18l-6-6 6-6",
  camera:
    "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5h.01",
  edit: "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  share: "M12 3v12 M7 8l5-5 5 5 M5 13v7h14v-7",
  copy: "M8 8h12v12H8z M16 8V4H4v12h4",
  check: "M5 12l5 5L20 7",
  table: "M3 10h18 M5 10v9 M19 10v9 M7 6h10l4 4H3z",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  warn: "M12 3l10 18H2z M12 10v4 M12 17.5h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
  money:
    "M12 3v18 M16.5 7.5c-.6-1.6-2.3-2.5-4.5-2.5-2.5 0-4.5 1.3-4.5 3.3 0 4.4 9 2.4 9 6.9 0 2-2 3.3-4.5 3.3-2.3 0-4-1-4.6-2.7",
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
