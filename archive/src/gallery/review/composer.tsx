// Client-only: rendered from ReviewDock, which is the "use client" boundary.
import { useEffect, useMemo, useRef, useState } from "react";

import { getReviewerName, reviewApi } from "./client";
import type { InspectTarget } from "./inspector";
import type { FeedbackItem, ReviewTarget } from "./model";
import { partById, parts } from "./parts";
import styles from "./review.module.css";

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** A comment at one spot (target set) or a general note about the page (target null). */
export function Composer({
  design,
  where,
  isDesign,
  target,
  onClose,
  onSaved,
}: {
  design: ReviewTarget;
  where: string;
  isDesign: boolean;
  target: InspectTarget | null;
  onClose: () => void;
  onSaved: (item: FeedbackItem) => void;
}) {
  const note = target === null;
  const [body, setBody] = useState("");
  const [part, setPart] = useState(target?.part ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const coords = useMemo(() => {
    if (!target) return { x: null, y: null };
    if (target.element) {
      const rect = target.element.getBoundingClientRect();
      return { x: clamp((target.clientX - rect.left) / rect.width), y: clamp((target.clientY - rect.top) / rect.height) };
    }
    const root = document.documentElement;
    return { x: clamp((target.clientX + window.scrollX) / root.scrollWidth), y: clamp((target.clientY + window.scrollY) / root.scrollHeight) };
  }, [target]);

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const reviewer = getReviewerName();
    const payload = note
      ? { kind: "note" as const, design, reviewer, part: part || null, body }
      : { kind: "comment" as const, design, reviewer, part: part || null, body, ...coords };
    const result = await reviewApi<{ id: string; createdAt: string }>("/api/gallery/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved({
      id: result.data.id,
      createdAt: result.data.createdAt,
      reviewer,
      kind: payload.kind,
      part: payload.part,
      body: body.trim(),
      x: note ? null : coords.x,
      y: note ? null : coords.y,
    });
  };

  const place = target
    ? { left: Math.max(8, Math.min(target.clientX + 12, window.innerWidth - 360)), top: Math.max(8, Math.min(target.clientY + 12, window.innerHeight - 320)) }
    : undefined;

  return (
    <div data-review-ui className={`${styles.ui} ${styles.scrim} ${note ? styles.scrimDim : ""}`} onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-composer-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        style={place}
        className={`${styles.card} ${note ? "" : styles.anchored}`}
      >
        <h2 id="review-composer-title" className={styles.cardTitle}>{note ? `Note about ${where}` : "Comment"}</h2>
        {!note && target?.part && <p className={styles.cardSub}>On “{partById[target.part]?.label ?? target.part}”</p>}
        {note && isDesign && (
          <label className={styles.field}>
            About one piece (optional)
            <select className={styles.input} value={part} onChange={(event) => setPart(event.target.value)}>
              <option value="">The whole design</option>
              {parts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        )}
        <label className={styles.field}>
          {note ? "Your note" : "What would you change or keep?"}
          <textarea
            ref={textRef}
            className={styles.input}
            required
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={note ? "Tell us what you think" : "For example: keep this, but make the headline bigger"}
          />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.solid} disabled={saving || !body.trim()}>
            {saving ? "Saving" : note ? "Send note" : "Save comment"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Asks once for the reviewer's name, so the team knows who said what. */
export function NameDialog({ onSave, onCancel }: { onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <div data-review-ui className={`${styles.ui} ${styles.scrim} ${styles.scrimDim}`}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-name-title"
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSave(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 id="review-name-title" className={styles.cardTitle}>Who is reviewing?</h2>
        <p className={styles.cardSub}>Your name goes with each comment and pick, so the team knows who said what.</p>
        <label className={styles.field}>
          Your name
          <input ref={inputRef} className={styles.input} required maxLength={80} autoComplete="name" value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.solid}>Continue</button>
        </div>
      </form>
    </div>
  );
}
