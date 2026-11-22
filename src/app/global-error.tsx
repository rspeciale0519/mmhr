"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F4F7FF", color: "#0D1A4A", padding: 48 }}>
        <h1>Something went wrong</h1>
        <p>The error has been reported. Please try again.</p>
      </body>
    </html>
  );
}
