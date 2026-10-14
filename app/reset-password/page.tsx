import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata = { title: "Reset password · Too Good For Merch", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <ResetPasswordClient />
    </Suspense>
  );
}
