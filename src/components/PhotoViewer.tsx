import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { Icon } from "./common";

/** Full-screen receipt photo. Tap the photo to zoom in, then scroll around. */
export function PhotoViewer({ photo, onClose }: { photo: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Where on the photo (0–1 across and down) the last tap landed.
  const focus = useRef({ x: 0.5, y: 0.5 });

  function toggleZoom(e: MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    focus.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    setZoomed((z) => !z);
  }

  // After zooming in, scroll so the tapped spot sits in the middle.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const img = box?.querySelector("img");
    if (!box || !img || !zoomed) return;
    box.scrollLeft = img.offsetWidth * focus.current.x - box.clientWidth / 2;
    box.scrollTop = img.offsetHeight * focus.current.y - box.clientHeight / 2;
  }, [zoomed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label="Receipt photo">
      <div className="photo-viewer-bar">
        <span>{zoomed ? "Tap photo to fit screen" : "Tap a spot to zoom in"}</span>
        <button type="button" className="photo-viewer-close" onClick={onClose} aria-label="Close photo">
          <Icon name="close" />
        </button>
      </div>
      <div ref={scrollRef} className={`photo-viewer-scroll ${zoomed ? "is-zoomed" : ""}`}>
        <img src={photo} alt="Receipt photo" onClick={toggleZoom} />
      </div>
    </div>
  );
}
