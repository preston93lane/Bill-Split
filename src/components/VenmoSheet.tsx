import { useState, type FormEvent } from "react";
import { cleanVenmoUsername } from "../lib/venmo";
import { Modal } from "./common";

/** Change the Venmo username that goes into the pay links you send. */
export function VenmoSheet({
  initial,
  hasBill,
  onSave,
  onClose,
}: {
  initial: string;
  hasBill: boolean;
  onSave: (venmo: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const clean = cleanVenmoUsername(value);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(clean);
  }

  return (
    <Modal title="Venmo for pay links" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <p className="muted small">
          Messages you send include links that open Venmo with each person's amount filled in, paying this
          account.{hasBill ? " Changing it updates this bill too, including the link friends already have." : ""}
        </p>
        <span className="venmo-input">
          <span aria-hidden="true">@</span>
          <input
            type="text"
            className="name-input"
            value={value}
            placeholder="your-venmo-username"
            aria-label="Venmo username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value.replace(/^\s*@+/, ""))}
          />
        </span>
        {clean && (
          <a
            className="link-btn"
            href={`https://venmo.com/${encodeURIComponent(clean)}`}
            target="_blank"
            rel="noreferrer"
          >
            Check it's right: open venmo.com/{clean}
          </a>
        )}
        <div className="modal-actions">
          {initial && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => onSave("")}>
              Remove
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
