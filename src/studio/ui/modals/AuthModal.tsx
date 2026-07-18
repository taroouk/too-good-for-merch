import type { ChangeEventHandler, FormEventHandler } from "react";

type AuthMode = "login" | "signup";

type AuthModalProps = {
  authMode: AuthMode;
  authEmail: string;
  authPassword: string;
  authError: string | null;
  authPending: boolean;
  submitDisabled: boolean;
  onClose: () => void;
  onSelectLogin: () => void;
  onSelectSignup: () => void;
  onToggleMode: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onEmailChange: ChangeEventHandler<HTMLInputElement>;
  onPasswordChange: ChangeEventHandler<HTMLInputElement>;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AuthModal({
  authMode,
  authEmail,
  authPassword,
  authError,
  authPending,
  submitDisabled,
  onClose,
  onSelectLogin,
  onSelectSignup,
  onToggleMode,
  onSubmit,
  onEmailChange,
  onPasswordChange,
}: AuthModalProps) {
  return (
    <div className="studio-modal-overlay">
      <div className="studio-auth-modal studio-modal-panel">
        <button
          type="button"
          onClick={onClose}
          className="studio-modal-close"
          aria-label="Close login or signup"
        >
          ×
        </button>

        <div className="studio-modal-kicker">TGFM Account</div>
        <h2 className="studio-auth-title">Login Or Sign Up</h2>
        <p className="studio-auth-copy">
          Continue to save your artwork and build your T-shirt.
        </p>

        <div className="studio-auth-tabs" role="tablist" aria-label="Account mode">
          <button
            type="button"
            onClick={onSelectLogin}
            className={cn(
              "studio-auth-tab",
              authMode === "login" ? "studio-auth-tab-active" : "",
            )}
            aria-pressed={authMode === "login"}
          >
            Login
          </button>

          <button
            type="button"
            onClick={onSelectSignup}
            className={cn(
              "studio-auth-tab",
              authMode === "signup" ? "studio-auth-tab-active" : "",
            )}
            aria-pressed={authMode === "signup"}
          >
            Sign Up
          </button>
        </div>

        <form className="studio-auth-form" onSubmit={onSubmit}>
          <label className="studio-auth-field">
            <span className="studio-auth-label">Email</span>
            <input
              className="studio-auth-input"
              type="email"
              value={authEmail}
              onChange={onEmailChange}
              autoComplete="email"
              placeholder="you@email.com"
              required
            />
          </label>

          <label className="studio-auth-field">
            <span className="studio-auth-label">Password</span>
            <input
              className="studio-auth-input"
              type="password"
              value={authPassword}
              onChange={onPasswordChange}
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              minLength={authMode === "signup" ? 8 : undefined}
              placeholder={authMode === "signup" ? "min 8 chars" : "password"}
              required
            />
          </label>

          {authMode === "signup" ? (
            <div className="studio-auth-hint">
              Password must be at least 8 characters.
            </div>
          ) : null}

          {authError ? <div className="studio-auth-error">{authError}</div> : null}

          <button
            type="submit"
            className="studio-auth-submit"
            disabled={submitDisabled}
          >
            {authPending
              ? authMode === "signup"
                ? "Creating..."
                : "Logging in..."
              : authMode === "signup"
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        <div className="studio-auth-footer">
          {authMode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={onToggleMode}
            className="studio-auth-inline-button"
          >
            {authMode === "login" ? "Create account" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
