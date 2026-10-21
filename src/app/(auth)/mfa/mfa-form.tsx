"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string | null; status: string };
type Enrollment = { id: string; qrCode: string };

const client = createClient();

/**
 * Provides the user-controlled TOTP enrollment and challenge flow.
 * The browser uses only the public Supabase client; authorization stays in Auth.
 */
export function MfaForm() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const response = await client.auth.mfa.listFactors();
    if (response.error) {
      setError("We could not load your authentication factors.");
      return;
    }
    const verified = (response.data?.totp ?? []).filter((factor) => factor.status === "verified");
    setFactors(verified);
    setFactorId((current) => current || verified[0]?.id || "");
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadFactors());
  }, [loadFactors]);

  async function enroll() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "MMHR authenticator",
    });
    setBusy(false);
    if (response.error || !response.data) {
      setError("We could not start MFA enrollment.");
      return;
    }
    setEnrollment({ id: response.data.id, qrCode: response.data.totp.qr_code });
    setFactorId(response.data.id);
    setCode("");
    setMessage("Scan the QR code, then enter the six digit code.");
  }

  async function startChallenge() {
    if (!factorId) {
      setError("Select an authentication factor first.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await client.auth.mfa.challenge({ factorId });
    setBusy(false);
    if (response.error || !response.data) {
      setError("We could not start the MFA challenge.");
      return;
    }
    setChallengeId(response.data.id);
    setCode("");
    setMessage("Enter the six digit code from your authenticator.");
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !challengeId || !/^\d{6}$/.test(code)) {
      setError("Enter the six digit code from your authenticator.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await client.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });
    setBusy(false);
    if (response.error) {
      setError("That code was not accepted. Try again.");
      return;
    }
    setEnrollment(null);
    setChallengeId("");
    setCode("");
    setMessage("MFA is active for this session.");
    await loadFactors();
  }

  return (
    <section className="flex max-w-sm flex-col gap-4" aria-label="MFA settings">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Multi factor authentication</h1>
        <p className="text-sm">Use an authenticator app to protect your account.</p>
      </div>

      {enrollment ? (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <p className="text-sm">Scan this QR code with your authenticator app.</p>
          {/* The provider creates this image URL for the one-time enrollment. */}
          {/* Provider QR data is a runtime data URL, so next/image cannot optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrCode} alt="Authenticator enrollment QR code" width={220} height={220} />
        </div>
      ) : null}

      {factors.length > 0 ? (
        <label className="flex flex-col gap-2 text-sm">
          Authentication factor
          <select className="rounded-md border p-2" value={factorId} onChange={(event) => setFactorId(event.target.value)}>
            {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name ?? "Authenticator"}</option>)}
          </select>
        </label>
      ) : null}

      {challengeId || enrollment ? (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <Label htmlFor="mfa-code">Six digit code</Label>
          <Input id="mfa-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required />
          <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Verify code"}</Button>
        </form>
      ) : null}

      {!enrollment && !challengeId ? (
        <div className="flex gap-3">
          <Button type="button" onClick={() => void enroll()} disabled={busy}>Enroll authenticator</Button>
          {factors.length > 0 ? <Button type="button" variant="outline" onClick={() => void startChallenge()} disabled={busy}>Verify factor</Button> : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-green-700">{message}</p> : null}
    </section>
  );
}
