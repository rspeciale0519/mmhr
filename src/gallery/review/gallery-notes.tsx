"use client";

import { useState } from "react";

import { getReviewerName, reviewApi, setReviewerName, useReviewerName } from "./client";
import styles from "./pages.module.css";

type Status = { kind: "idle" | "saving" | "sent" } | { kind: "error"; message: string };

/** Overall feedback about the whole set, saved against the gallery page. */
export function GalleryNotes({ designNames }: { designNames: string[] }) {
  const savedName = useReviewerName();
  const [name, setName] = useState("");
  const [favorite, setFavorite] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    const reviewer = savedName || name.trim();
    if (!reviewer) return setStatus({ kind: "error", message: "Add your name so the team knows who sent this." });
    if (!getReviewerName()) setReviewerName(reviewer);
    setStatus({ kind: "saving" });
    const text = favorite ? `Closest direction: ${favorite}\n\n${body}` : body;
    const result = await reviewApi("/api/gallery/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "note", design: "gallery", reviewer, part: null, body: text }),
    });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setBody("");
    setFavorite("");
    setStatus({ kind: "sent" });
  };

  if (status.kind === "sent") {
    return (
      <div className={styles.panel} role="status">
        <p className={styles.h2}>Thank you. Your note was sent.</p>
        <p className={styles.hint}>You can send another one at any time, or keep reviewing the designs.</p>
        <div>
          <button type="button" className={styles.button} onClick={() => setStatus({ kind: "idle" })}>Write another note</button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      {!savedName && (
        <label className={styles.label}>
          Your name
          <input className={styles.input} required maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      )}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Which direction feels closest to you? (optional)</legend>
        <div className={styles.choices}>
          {[...designNames, "A mix of several"].map((label) => (
            <label key={label} className={styles.choice}>
              <input className={styles.srOnly} type="radio" name="favorite" value={label} checked={favorite === label} onChange={() => setFavorite(label)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={styles.label}>
        Your overall thoughts
        <textarea
          className={styles.input}
          required
          rows={5}
          maxLength={3800}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What do you like? What is missing? What should the team know?"
        />
      </label>
      {status.kind === "error" && <p className={styles.error} role="alert">{status.message}</p>}
      <div className={styles.row}>
        {savedName ? <p className={styles.small}>Sending as {savedName}</p> : <span />}
        <button type="submit" className={styles.button} disabled={status.kind === "saving"}>
          {status.kind === "saving" ? "Sending" : "Send note"}
        </button>
      </div>
    </form>
  );
}
