import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Icon, Modal } from "./components/common";
import { PhotoViewer } from "./components/PhotoViewer";
import { ResultsStep } from "./components/ResultsStep";
import { ReviewStep } from "./components/ReviewStep";
import { ScanStep } from "./components/ScanStep";
import { SplitStep } from "./components/SplitStep";
import { setCurrency } from "./lib/money";
import type { Step } from "./lib/types";
import { loadSavedPhoto, loadSavedState, reducer, savePhoto, saveState } from "./state";

const STEPS: { step: Step; title: string; back: Step | null }[] = [
  { step: "scan", title: "", back: null },
  { step: "review", title: "Check the receipt", back: "scan" },
  { step: "split", title: "Who had what?", back: "review" },
  { step: "results", title: "Who owes what", back: "split" },
];

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadSavedState);
  const [confirmNew, setConfirmNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(loadSavedPhoto);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const closePhoto = useCallback(() => setViewingPhoto(false), []);

  useEffect(() => {
    savePhoto(photo);
  }, [photo]);
  const toastTimer = useRef<number | undefined>(undefined);

  setCurrency(state.bill?.currency);

  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const { bill } = state;
  const step = bill ? state.step : "scan";
  const meta = STEPS.find((s) => s.step === step) ?? STEPS[0]!;
  const stepNumber = STEPS.findIndex((s) => s.step === step);

  return (
    <div className="app">
      {step !== "scan" && (
        <header className="topbar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back"
            onClick={() =>
              meta.back === "scan" ? setConfirmNew(true) : meta.back && dispatch({ type: "goTo", step: meta.back })
            }
          >
            <Icon name="back" />
          </button>
          <div className="topbar-title">
            <span>{meta.title}</span>
            <span className="steps" aria-label={`Step ${stepNumber} of 3`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={`step-dot ${n <= stepNumber ? "on" : ""}`} />
              ))}
            </span>
          </div>
          <div className="topbar-actions">
            {photo && (
              <button
                type="button"
                className="icon-btn"
                aria-label="View receipt photo"
                title="View receipt photo"
                onClick={() => setViewingPhoto(true)}
              >
                <Icon name="receipt" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmNew(true)}>
              New bill
            </button>
          </div>
        </header>
      )}

      {step === "scan" && (
        <ScanStep
          onBill={(b, scanned) => {
            setPhoto(scanned ?? null);
            dispatch({ type: "loadBill", bill: b });
          }}
        />
      )}

      {step === "review" && bill && (
        <ReviewStep
          bill={bill}
          onChange={(b) => dispatch({ type: "updateBill", bill: b })}
          onNext={() => dispatch({ type: "goTo", step: "split" })}
          photo={photo}
          onViewPhoto={() => setViewingPhoto(true)}
        />
      )}

      {step === "split" && bill && (
        <SplitStep
          bill={bill}
          people={state.people}
          claims={state.claims}
          activePersonId={state.activePersonId}
          dispatch={dispatch}
          onDone={() => dispatch({ type: "goTo", step: "results" })}
        />
      )}

      {step === "results" && bill && (
        <ResultsStep
          bill={bill}
          people={state.people}
          claims={state.claims}
          payerId={state.payerId}
          onSetPayer={(id) => dispatch({ type: "setPayer", id })}
          notify={notify}
        />
      )}

      {confirmNew && (
        <Modal title="Start a new bill?" onClose={() => setConfirmNew(false)}>
          <div className="modal-body">
            <p className="muted">This clears the current receipt and everyone's picks.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmNew(false)}>
                Keep this one
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmNew(false);
                  setPhoto(null);
                  dispatch({ type: "reset" });
                }}
              >
                Start over
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewingPhoto && photo && <PhotoViewer photo={photo} onClose={closePhoto} />}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
