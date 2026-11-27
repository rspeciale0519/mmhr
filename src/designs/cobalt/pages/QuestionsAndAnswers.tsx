import { AccordionItem } from "../motion/Accordion";
import { RevealGroup } from "../motion/Reveal";
import { JsonLd } from "./JsonLd";

/** One question and its answer, both as plain text. */
export type QuestionAndAnswer = {
  readonly question: string;
  readonly answer: string;
};

/**
 * A list of questions as expandable rows, plus the matching FAQPage
 * structured data for search and answer engines.
 *
 * Why plain strings: the structured data must say exactly what the visitor
 * can read on the page (search engines check this), so the same strings feed
 * both the visible text and the JSON-LD. Keep each answer short, direct, and
 * true; start with the answer itself, then add one supporting sentence.
 *
 * Rows (AccordionItem, ../motion/Accordion.tsx): each question is a button
 * inside an <h3>; the first row starts open, the rest open on click. Every
 * answer stays in the HTML even while closed (`hidden="until-found"`), so
 * search engines read it and find-in-page finds and opens it. Without
 * JavaScript all answers are open. The rows rise in one after another when
 * the list scrolls into view.
 *
 * Use at most one of these per page: a page should describe one FAQPage.
 * Put it inside a <PageSection> so it has a section heading.
 *
 * Styles: `.co-qa` in src/designs/cobalt/pages.css, rows in motion-kit.css.
 */
export function QuestionsAndAnswers({ items }: { items: readonly QuestionAndAnswer[] }) {
  return (
    <>
      <RevealGroup className="co-qa" stagger={60}>
        {items.map((item, index) => (
          <AccordionItem className="co-qa-item" key={item.question} title={item.question} defaultOpen={index === 0}>
            <p>{item.answer}</p>
          </AccordionItem>
        ))}
      </RevealGroup>
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
