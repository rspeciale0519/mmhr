"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

type Props = {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  mode: "sign-in" | "sign-up";
  submitLabel: string;
};

export function AuthForm({ action, mode, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      {mode === "sign-up" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input id="full-name" name="fullName" required maxLength={200} autoComplete="name" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" name="company" required maxLength={200} autoComplete="organization" />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      {mode === "sign-up" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="direct-company-phone">Direct company phone</Label>
          <Input
            id="direct-company-phone"
            name="directCompanyPhone"
            type="tel"
            required
            maxLength={24}
            autoComplete="tel"
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "sign-up" ? 12 : 8}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        />
      </div>

      {mode === "sign-up" ? (
        <label className="flex items-start gap-2 text-sm" htmlFor="consent">
          <input id="consent" name="consent" type="checkbox" required />
          <span>
            I agree that MatchMaker HR may contact me about my request. See our{" "}
            <a className="underline" href="/privacy">privacy notice</a>.
          </span>
        </label>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      {state?.success ? (
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}
