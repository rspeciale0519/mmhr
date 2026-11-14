"use client";

import Link from "next/link";
import { useState } from "react";

import { getReviewerName, pickKey, reviewApi, setReviewerName, usePicks, useReviewerName } from "./client";
import type { ReviewDesign } from "./design-switcher";
import { partGroups, parts, type Part } from "./parts";
import styles from "./pages.module.css";

type Choice = { design: string | null; note: string };
type Status = { kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string };
type Row = { part: Part; choice: Choice };

/** "Build final design": choose which design each piece should come from, then send the recipe. */
export function FinalDesignBuilder({ designs }: { designs: ReviewDesign[] }) {
  const picks = usePicks();
  const savedName = useReviewerName();
  const [base, setBase] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Choice>>({});
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const nameOf = (slug: string) => designs.find((design) => design.slug === slug)?.name ?? slug;

  const pickedFrom = (part: string) => designs.filter((design) => picks[pickKey(design.slug, part)]).map((design) => design.slug);

  // A pick made while browsing fills in the row, until the reviewer changes it here.
  const choiceFor = (part: string): Choice => {
    const override = overrides[part];
    if (override) return override;
    const picked = pickedFrom(part);
    return { design: picked.length === 1 ? picked[0]! : null, note: "" };
  };

  const setChoice = (part: string, patch: Partial<Choice>) =>
    setOverrides((current) => ({ ...current, [part]: { ...choiceFor(part), ...patch } }));

  const recipe: Row[] = parts
    .map((part) => ({ part, choice: choiceFor(part.id) }))
    .filter((row) => row.choice.design || row.choice.note);
  const pickCount = Object.keys(picks).length;

  const send = async () => {
    const reviewer = savedName || name.trim();
    if (!reviewer) return setStatus({ kind: "error", message: "Add your name so the team knows whose recipe this is." });
    const selections = recipe
      .filter((row) => row.choice.design || base)
      .map((row) => ({ part: row.part.id, design: row.choice.design ?? base, note: row.choice.note.trim() || null }));
    if (!selections.length && !base) {
      return setStatus({ kind: "error", message: "Choose a starting design or at least one piece first." });
    }
    // A note on a piece with no design chosen still reaches the team, in the general notes.
    const looseNotes = recipe
      .filter((row) => !row.choice.design && !base && row.choice.note.trim())
      .map((row) => `${row.part.label}: ${row.choice.note.trim()}`);
    if (!getReviewerName()) setReviewerName(reviewer);
    setStatus({ kind: "sending" });
    const result = await reviewApi("/api/gallery/recipes", {
      method: "POST",
      body: JSON.stringify({ reviewer, baseDesign: base, selections, notes: [...looseNotes, notes.trim()].filter(Boolean).join("\n\n") }),
    });
    if (!result.ok) return setStatus({ kind: "error", message: result.error });
    setStatus({ kind: "sent" });
    window.scrollTo({ top: 0 });
  };

  if (status.kind === "sent") {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Your final design was sent.</h1>
        <p className={styles.lede}>The team now has your recipe. Here is what you asked for:</p>
        <div className={styles.panel} style={{ marginBlockStart: "2rem", maxInlineSize: "40rem" }}>
          <RecipeList base={base} recipe={recipe} nameOf={nameOf} />
        </div>
        <div className={styles.row} style={{ justifyContent: "flex-start", marginBlockStart: "2rem" }}>
          <button type="button" className={styles.button} onClick={() => setStatus({ kind: "idle" })}>Edit and send again</button>
          <Link className={styles.ghost} href="/gallery">Back to all designs</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Build your final design</h1>
      <p className={styles.lede}>
        Choose which design each piece should come from. Pieces you picked while browsing are already filled in
        {pickCount ? ` (${pickCount} so far)` : ""}. Leave a row empty if you have no preference.
      </p>

      <div className={styles.layout}>
        <div>
          <section className={styles.section} aria-labelledby="build-base-title">
            <h2 id="build-base-title" className={styles.h2}>Start from one design (optional)</h2>
            <p className={styles.hint}>Every piece you leave empty comes from this design.</p>
            <div className={styles.tiles}>
              {designs.map((design) => (
                <button
                  key={design.slug}
                  type="button"
                  className={styles.tile}
                  aria-pressed={base === design.slug}
                  onClick={() => setBase(base === design.slug ? null : design.slug)}
                >
                  <span className={styles.tileDots} aria-hidden="true">
                    {design.palette.slice(0, 4).map((hex, index) => <span key={index} style={{ background: hex }} />)}
                  </span>
                  <span className={styles.tileName}>{design.name}</span>
                  <span className={styles.tileMeta}>Design {design.number}</span>
                </button>
              ))}
            </div>
          </section>

          {partGroups.map((group) => (
            <section key={group} className={styles.section} aria-labelledby={`build-${group}`}>
              <h2 id={`build-${group}`} className={styles.h2}>{group}</h2>
              <ul className={styles.parts}>
                {parts.filter((part) => part.group === group).map((part) => {
                  const choice = choiceFor(part.id);
                  const picked = pickedFrom(part.id);
                  return (
                    <li key={part.id} className={styles.part}>
                      <div className={styles.partHead}>
                        <div>
                          <h3 className={styles.partTitle}>{part.label}</h3>
                          <p className={styles.partHint}>{part.hint}</p>
                        </div>
                        <button
                          type="button"
                          className={styles.textButton}
                          aria-expanded={openNote === part.id || Boolean(choice.note)}
                          onClick={() => setOpenNote(openNote === part.id ? null : part.id)}
                        >
                          {choice.note ? "Edit note" : "Add a note"}
                        </button>
                      </div>
                      <div role="radiogroup" aria-label={`${part.label}: choose a design`} className={styles.pills}>
                        {designs.map((design) => {
                          const on = choice.design === design.slug;
                          return (
                            <span key={design.slug} className={styles.pillGroup}>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={on}
                                className={styles.pill}
                                onClick={() => setChoice(part.id, { design: on ? null : design.slug })}
                              >
                                <span className={styles.pillDot} style={{ background: design.palette[0] }} aria-hidden="true" />
                                {design.name}
                                {picked.includes(design.slug) && <span className={styles.heart} aria-label="you picked this">♥</span>}
                              </button>
                              <a
                                className={styles.view}
                                href={`/gallery/${design.slug}?part=${part.id}`}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`View ${part.label} in ${design.name} (opens in a new tab)`}
                              >
                                View
                              </a>
                            </span>
                          );
                        })}
                      </div>
                      {(openNote === part.id || choice.note) && (
                        <textarea
                          className={`${styles.input} ${styles.note}`}
                          rows={2}
                          maxLength={1000}
                          aria-label={`Note about ${part.label}`}
                          placeholder="Anything to change about this piece?"
                          value={choice.note}
                          onChange={(event) => setChoice(part.id, { note: event.target.value })}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className={styles.aside} aria-labelledby="build-recipe-title">
          <div className={styles.panel}>
            <h2 id="build-recipe-title" className={styles.h2}>Your recipe</h2>
            {recipe.length === 0 && !base
              ? <p className={styles.hint}>Nothing chosen yet. Choose a starting design or pick pieces on the left.</p>
              : <RecipeList base={base} recipe={recipe} nameOf={nameOf} />}
            {!savedName && (
              <label className={styles.label}>
                Your name
                <input className={styles.input} maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label className={styles.label}>
              Anything else? (optional)
              <textarea className={styles.input} rows={4} maxLength={6000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {status.kind === "error" && <p className={styles.error} role="alert">{status.message}</p>}
            <button type="button" className={styles.button} disabled={status.kind === "sending"} onClick={send}>
              {status.kind === "sending" ? "Sending" : "Send final design"}
            </button>
            {savedName && <p className={styles.small}>Sending as {savedName}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RecipeList({ base, recipe, nameOf }: { base: string | null; recipe: Row[]; nameOf: (slug: string) => string }) {
  return (
    <ul className={styles.recipe}>
      {base && (
        <li className={styles.recipeBase}>
          <span>Everything else</span>
          <span>{nameOf(base)}</span>
        </li>
      )}
      {recipe.map(({ part, choice }) => (
        <li key={part.id}>
          <span>{part.label}</span>
          <span>
            {choice.design ? nameOf(choice.design) : base ? nameOf(base) : "Note only"}
            {choice.note && <span className={styles.recipeNote}>“{choice.note}”</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
