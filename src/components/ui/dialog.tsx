// file: src/components/ui/dialog.tsx
"use client";

// In-app replacements for window.alert / window.confirm, so every prompt in
// the project looks like the rest of the product instead of a browser
// dialog. Imperative and promise-based so call sites stay one line:
//
//   if (!(await confirmDialog({ title: "Delete?", message: "..." }))) return;
//   await alertDialog({ title: "Heads up", message: "..." });
//
// <DialogHost /> must be mounted once (it is, in Providers).
import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import { useEscapeToClose } from "src/studio/ui/modals/useEscapeToClose";
import { useModalDialog } from "src/studio/ui/modals/useModalDialog";

export type DialogTone = "default" | "danger";

type DialogOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
};

type DialogRequest = DialogOptions & {
  id: number;
  kind: "alert" | "confirm";
  resolve: (value: boolean) => void;
};

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function open(kind: DialogRequest["kind"], options: DialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...options, id: nextId++, kind, resolve }];
    emit();
  });
}

function settle(id: number, value: boolean) {
  const request = queue.find((item) => item.id === id);
  if (!request) return;
  queue = queue.filter((item) => item.id !== id);
  emit();
  request.resolve(value);
}

export function confirmDialog(options: DialogOptions): Promise<boolean> {
  return open("confirm", options);
}

export function alertDialog(options: DialogOptions): Promise<void> {
  return open("alert", options).then(() => undefined);
}

// Forms that used `if (!window.confirm(..)) event.preventDefault()` in a
// submit handler: stop the submit, ask, and re-submit once approved.
const approvedForms = new WeakSet<HTMLFormElement>();

export function confirmSubmit(event: FormEvent<HTMLFormElement>, options: DialogOptions) {
  const form = event.currentTarget;
  if (approvedForms.has(form)) {
    approvedForms.delete(form);
    return;
  }
  event.preventDefault();
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
  void confirmDialog(options).then((ok) => {
    if (!ok) return;
    approvedForms.add(form);
    form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
  });
}

function getSnapshot() {
  return queue;
}

// Must be a stable reference: a fresh [] per call makes React loop forever.
const EMPTY: DialogRequest[] = [];

function getServerSnapshot() {
  return EMPTY;
}

export function DialogHost() {
  const requests = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const current = requests[0];
  return current ? <DialogView key={current.id} request={current} /> : null;
}

function DialogView({ request }: { request: DialogRequest }) {
  const { id, kind, title, message, tone = "default" } = request;
  const confirmLabel = request.confirmLabel ?? (kind === "alert" ? "OK" : "Confirm");
  const cancelLabel = request.cancelLabel ?? "Cancel";
  const panelRef = useModalDialog<HTMLDivElement>(true);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => settle(id, false);

  useEscapeToClose(dismiss);

  // Lock page scroll while open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const danger = tone === "danger";

  return (
    <div
      className="tgfm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={panelRef}
        className="tgfm-dialog"
        role={kind === "alert" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`tgfm-dialog-title-${id}`}
        aria-describedby={message ? `tgfm-dialog-message-${id}` : undefined}
        tabIndex={-1}
      >
        <h2 id={`tgfm-dialog-title-${id}`} className="tgfm-dialog-title">
          {title}
        </h2>
        {message ? (
          <p id={`tgfm-dialog-message-${id}`} className="tgfm-dialog-message">
            {message}
          </p>
        ) : null}
        <div className="tgfm-dialog-actions">
          {kind === "confirm" ? (
            <button type="button" className="tgfm-dialog-button tgfm-dialog-button-ghost" onClick={dismiss}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            autoFocus
            className={`tgfm-dialog-button ${danger ? "tgfm-dialog-button-danger" : "tgfm-dialog-button-primary"}`}
            onClick={() => settle(id, true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
