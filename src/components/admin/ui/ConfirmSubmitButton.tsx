"use client";

import { buttonClass, type ButtonSize, type ButtonVariant } from "src/components/admin/ui/Button";
import { confirmDialog } from "src/components/ui/dialog";

export default function ConfirmSubmitButton({
  confirmMessage,
  variant = "danger",
  size = "md",
  className = "",
  children,
}: {
  confirmMessage: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={buttonClass({ variant, size, className })}
      onClick={(event) => {
        const button = event.currentTarget;
        const form = button.form;
        if (!form) return;
        event.preventDefault();
        void confirmDialog({
          title: "Are you sure?",
          message: confirmMessage,
          confirmLabel: "Confirm",
          tone: variant === "danger" ? "danger" : "default",
        }).then((ok) => {
          if (ok) form.requestSubmit(button);
        });
      }}
    >
      {children}
    </button>
  );
}
