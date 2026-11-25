import { JsonLd } from "./JsonLd";

/** One question and its answer, both as plain text. */
export type QuestionAndAnswer = {
  readonly question: string;
  readonly answer: string;
};

/**
 * A list of questions with their answers, always fully visible, plus the
 * matching FAQPage structured data for search and answer engines.
 *
 * Why plain strings: the structured data must say exactly what the visitor
 * can read on the page (search engines check this), so the same strings feed
 * both the visible text and the JSON-LD. Keep each answer short, direct, and
 * true; start with the answer itself, then add one supporting sentence.
 *
 * Use at most one of these per page: a page should describe one FAQPage.
 * Put it inside a <PageSection> so it has a section heading; each question
 * renders as an <h3> under that heading.
 *
 * Styles: `.co-qa` in src/designs/cobalt/pages.css.
 */
export function QuestionsAndAnswers({ items }: { items: readonly QuestionAndAnswer[] }) {
  return (
    <>
      <div className="co-qa">
        {items.map((item) => (
          <div className="co-qa-item" key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />
    </>
  );
}
