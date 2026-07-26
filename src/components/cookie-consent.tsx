"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  isConsentDecisionMade,
} from "@/lib/analytics/consent";
import { initAnalytics } from "@/lib/analytics/posthog";

// The consent cookie is external state, so it is read through
// useSyncExternalStore rather than mirrored into React state inside an effect
// (which would cascade renders). `emit` lets the banner re-read after a click.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function CookieConsent() {
  const decided = useSyncExternalStore(
    subscribe,
    () => isConsentDecisionMade(),
    // On the server there is no cookie to read; render nothing and let the
    // client decide, so the markup never flashes a banner it will remove.
    () => true,
  );

  useEffect(() => {
    // No-ops unless consent was granted on a previous visit.
    initAnalytics();
  }, []);

  const decide = useCallback((granted: boolean) => {
    if (granted) {
      grantAnalyticsConsent();
      initAnalytics();
    } else {
      denyAnalyticsConsent();
    }
    emit();
  }, []);

  if (decided) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-between gap-4 border-t bg-white p-4 text-sm"
    >
      <p className="max-w-2xl">
        We use analytics cookies to understand how the site is used. Nothing is
        tracked until you accept.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => decide(false)}>
          Decline
        </Button>
        <Button onClick={() => decide(true)}>Accept</Button>
      </div>
    </div>
  );
}
