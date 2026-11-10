import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { GuestApp } from "./GuestApp";
import { loadHistory, loadSavedState } from "./state";
import "./styles.css";

// A link like /?tab=abc123 is a shared bill a friend sent. If this phone is
// the one that shared it (now or as an older, unfinished bill), open the
// normal host app instead.
const tabId = new URLSearchParams(window.location.search).get("tab");
const isHost =
  tabId !== null &&
  (loadSavedState().sharedTab?.id === tabId ||
    loadHistory().some((h) => h.state.sharedTab?.id === tabId));
if (isHost) window.history.replaceState(null, "", "/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {tabId && !isHost ? <GuestApp tabId={tabId} /> : <App openTabId={tabId ?? undefined} />}
  </StrictMode>,
);
