import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}