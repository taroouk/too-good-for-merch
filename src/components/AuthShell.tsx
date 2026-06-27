// src/components/AuthShell.tsx
import Link from "next/link";
import React from "react";
import AuthAction from "src/components/AuthAction";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="authPage">
      <header className="authHeader">
        <Link href="/" className="authBrand">
          TOO GOOD FOR MERCH
        </Link>
        <div className="authRight">
          <AuthAction className="authLink authActionReset" />
          <Link className="authLink" href="/register">
            Register
          </Link>
        </div>
      </header>

      <main className="authMain">
        <section className="authCard">
          <div className="authTitleWrap">
            <h1 className="authTitle">{title}</h1>
            {subtitle ? <p className="authSubtitle">{subtitle}</p> : null}
          </div>

          <div className="authBody">{children}</div>

          {footer ? <div className="authFooter">{footer}</div> : null}
        </section>
      </main>
    </div>
  );
}
