import { CtaBand } from "../CtaBand";
import { JsonLd, type JsonLdValue } from "../JsonLd";
import { PageHero } from "../PageHero";
import { PageSection } from "../PageSection";
import { checklistSteps, glossaryTerms } from "./content";
import "./resources.css";

/**
 * Body of /resources. The route file
 * (src/app/(marketing)/(site)/resources/page.tsx) only sets the metadata and
 * renders this, so all page content lives here.
 *
 * What is on the page today: a short buyer's checklist and a starter
 * glossary, both written right here (text in ./content.ts). Fuller guides, a
 * longer glossary, and a quiz come later.
 *
 * Pages below /resources (for example /resources/some-guide) stay blocked by
 * src/lib/launch-surface.ts until the owner approves each one. Do not link to
 * one from here before that, or the link leads to a not-found page. The
 * buttons below only jump to sections of this page (#checklist, #glossary).
 *
 * Styles: ./resources.css. Shared blocks: src/designs/cobalt/pages/.
 */

/**
 * The glossary as structured data (a schema.org DefinedTermSet), built from
 * the same strings the visitor reads, so search and answer engines see
 * exactly what is on the page.
 */
function glossaryData(): JsonLdValue {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "HR software terms, in plain language",
    hasDefinedTerm: glossaryTerms.map((entry) => {
      const term: { [key: string]: JsonLdValue } = {
        "@type": "DefinedTerm",
        name: entry.term,
        description: entry.definition,
      };
      if (entry.expansion) term.alternateName = entry.expansion;
      return term;
    }),
  };
}

export function ResourcesBody() {
  return (
    <>
      <PageHero
        title="Resources"
        lede="Plain-language help for choosing HR software. Use the buyer's checklist and the glossary below today, whether or not you use MatchMaker HR."
        actions={
          <>
            <a className="co-btn co-btn-p" href="#checklist">Read the checklist</a>
            <a className="co-btn co-btn-g" href="#glossary">Open the glossary</a>
          </>
        }
      />

      <PageSection
        id="checklist"
        title="How to choose HR software: a short buyer's checklist"
        intro="General good practice for any buyer and any provider. Work through it in order before you compare options."
      >
        <ol className="co-res-steps">
          {checklistSteps.map((step, index) => (
            <li className="co-res-rv" key={step.title}>
              <span aria-hidden="true" className="co-res-n">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection
        id="glossary"
        title="HR software terms, in plain language"
        intro="Short definitions of the words you will meet when you compare HR software."
      >
        <dl className="co-res-terms">
          {glossaryTerms.map((entry) => (
            <div className="co-res-rv" key={entry.term}>
              <dt>
                <dfn>{entry.term}</dfn>
                {entry.expansion ? <span>{entry.expansion}</span> : null}
              </dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
        <JsonLd data={glossaryData()} />
        <p className="co-res-next">
          Coming next: buyer guides, a fuller glossary, and a short quiz are being prepared for this section.
        </p>
      </PageSection>

      <CtaBand
        title="Start with your needs list."
        body="Turn your checklist into one needs list. Every matching option is scored against it, and buyers never pay MMHR."
      />
    </>
  );
}
