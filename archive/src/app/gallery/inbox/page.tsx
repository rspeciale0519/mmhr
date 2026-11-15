import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { reviewDesigns } from "@/gallery/review/designs";
import { partById, parts } from "@/gallery/review/parts";
import styles from "@/gallery/review/pages.module.css";
import { isReviewStorageConfigured, readInbox } from "@/gallery/review/store";

export const metadata: Metadata = {
  title: "Review inbox | MMHR design gallery",
  robots: { index: false, follow: false },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

const nameOf = (slug: string) =>
  reviewDesigns.find((design) => design.slug === slug)?.name
  ?? (slug === "gallery" ? "Gallery" : slug === "final" ? "Final design builder" : slug);

/**
 * Everything reviewers sent: pick counts, final-design recipes, comments, and
 * notes. Reviewers can already see each other's comments as pins, so this page
 * has the same access as the rest of the gallery.
 */
export default async function ReviewInboxPage() {
  await connection();

  return (
    <main className={styles.page}>
      <div className={`${styles.wrap} ${styles.top}`}>
        <Link className={styles.back} href="/gallery">All designs</Link>
      </div>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Review inbox</h1>
        {isReviewStorageConfigured() ? <Inbox /> : (
          <p className={styles.lede}>Review storage is not set up on this deployment yet. Set GALLERY_REVIEW_DATABASE_URL.</p>
        )}
      </div>
    </main>
  );
}

async function Inbox() {
  const { feedback, recipes } = await readInbox();
  const picks = feedback.filter((item) => item.kind === "pick");
  const notes = feedback.filter((item) => item.kind !== "pick");
  const pickedDesigns = reviewDesigns.filter((design) => picks.some((pick) => pick.design === design.slug));
  const tally = (part: string, design: string) => picks.filter((pick) => pick.part === part && pick.design === design).length;

  return (
    <>
      <p className={styles.lede}>
        {count(notes.length, "comment or note", "comments and notes")}, {count(picks.length, "pick", "picks")}, and{" "}
        {count(recipes.length, "final design", "final designs")}.
      </p>

      <section className={styles.section} style={{ marginBlockStart: "3rem" }} aria-labelledby="inbox-picks">
        <h2 id="inbox-picks" className={styles.h2}>Picks by piece</h2>
        {pickedDesigns.length === 0 ? <p className={styles.empty}>No picks yet.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Piece</th>
                  {pickedDesigns.map((design) => <th key={design.slug} scope="col">{design.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {parts.map((part) => (
                  <tr key={part.id}>
                    <th scope="row">{part.label}</th>
                    {pickedDesigns.map((design) => {
                      const count = tally(part.id, design.slug);
                      return <td key={design.slug} className={styles.count} data-zero={count === 0 || undefined}>{count}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="inbox-recipes">
        <h2 id="inbox-recipes" className={styles.h2}>Final designs</h2>
        {recipes.length === 0 ? <p className={styles.empty}>No final designs yet.</p> : (
          <ul className={styles.items}>
            {recipes.map((recipe) => (
              <li key={recipe.id} className={styles.item}>
                <p className={styles.itemMeta}>{recipe.reviewer}, {when(recipe.createdAt)}</p>
                <ul className={styles.recipe} style={{ marginBlockStart: "0.75rem" }}>
                  {recipe.baseDesign && (
                    <li className={styles.recipeBase}><span>Everything else</span><span>{nameOf(recipe.baseDesign)}</span></li>
                  )}
                  {recipe.selections.map((selection) => (
                    <li key={selection.part}>
                      <span>{partById[selection.part]?.label ?? selection.part}</span>
                      <span>
                        {nameOf(selection.design)}
                        {selection.note && <span className={styles.recipeNote}>“{selection.note}”</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {recipe.notes && <p className={styles.itemBody}>{recipe.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="inbox-notes">
        <h2 id="inbox-notes" className={styles.h2}>Comments and notes</h2>
        {notes.length === 0 ? <p className={styles.empty}>No comments or notes yet.</p> : (
          <ul className={styles.items}>
            {notes.map((note) => (
              <li key={note.id} className={styles.item}>
                <p className={styles.itemMeta}>
                  {note.reviewer} on {nameOf(note.design)}
                  {note.part ? `, ${partById[note.part]?.label ?? note.part}` : ""}
                  {note.kind === "note" ? " (note)" : " (comment)"}, {when(note.createdAt)}
                </p>
                <p className={styles.itemBody}>{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
