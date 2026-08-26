"use client";

import { buttonClass, type ButtonSize, type ButtonVariant } from "src/components/admin/ui/Button";

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
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
