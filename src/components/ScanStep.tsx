import { useEffect, useRef, useState } from "react";
import { scanReceipt } from "../lib/image";
import { billFromParsed, emptyBill, makeItem } from "../lib/receipt";
import { sampleBill } from "../lib/sample";
import type { Bill } from "../lib/types";
import { Icon } from "./common";

export function ScanStep({ onBill }: { onBill: (bill: Bill) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const parsed = await scanReceipt(file);
      onBill(billFromParsed(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading the receipt.");
    } finally {
      setBusy(false);
    }
  }

  function enterManually() {
    onBill({ ...emptyBill(), items: [makeItem("", 0)] });
  }

  return (
    <main className="page scan">
      <section className="hero">
        <div className="hero-mark" aria-hidden="true">
          <Icon name="receipt" size={30} />
        </div>
        <h1>Split the check</h1>
        <p>Snap the receipt, tap what you ordered, and send everyone exactly what they owe.</p>
      </section>

      {busy || preview ? (
        <section className="scan-status" aria-live="polite">
          {preview && (
            <div className={`scan-preview ${busy ? "is-scanning" : ""}`}>
              <img src={preview} alt="Your receipt" />
              {busy && <div className="scan-beam" />}
            </div>
          )}
          {busy && <p className="scan-label">Reading your receipt…</p>}
        </section>
      ) : null}

      {error && (
        <div className="callout callout-danger" role="alert">
          <Icon name="warn" />
          <div>
            <strong>Couldn't read that one.</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!busy && (
        <section className="scan-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => cameraRef.current?.click()}>
            <Icon name="camera" /> {error ? "Retake photo" : "Take a photo"}
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => libraryRef.current?.click()}>
            <Icon name="image" /> Choose from photos
          </button>
          <div className="divider">
            <span>or</span>
          </div>
          <div className="scan-alt">
            <button type="button" className="btn btn-ghost" onClick={enterManually}>
              Type it in
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onBill(sampleBill())}>
              Try a sample
            </button>
          </div>
        </section>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </main>
  );
}
