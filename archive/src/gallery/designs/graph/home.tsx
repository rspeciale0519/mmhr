"use client";

import clsx from "clsx";

import { vendors } from "../../kit/data";
import { mergeClasses } from "../../kit/parts-ui";
import { SoftHome } from "../../kit/soft-home";
import page from "../../kit/soft-page.module.css";
import p from "../../kit/soft-parts.module.css";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { body, display } from "./fonts";
import own from "./home.module.css";
import { Network } from "./network";

const s = mergeClasses(page, own);

export default function GraphHome() {
  const { theme, toggle } = useDesignTheme("graph", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="graph"
      s={s}
      p={p}
      className={clsx(s.root, display.variable, body.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true"><i /><i /><i /></span>}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "Every link, scored.",
        scorecardText: "Each line in the graph is a 4 or 5 here. Open Evidence to see where a score came from.",
        stepsTitle: "Five steps from need to contract.",
        stepsText: "Your advisor stays with you at every step. You sign directly with the provider you choose.",
        caseTitle: "Your case, connected.",
        needsTitle: "Add your requirements.",
        faqTitle: "Questions, answered.",
        closingTitle: "Find the platform with the most connections to your needs.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="graph-hero-title">
          <div className={own.heroCopy}>
            <h1 id="graph-hero-title" className={own.heroTitle}>Your requirements, connected to the software that meets them.</h1>
            <p className={own.heroLede}>
              MatchMaker HR links every requirement you set to the approved platforms with verified evidence for it. Names stay
              hidden until you meet your advisor. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#graph-needs">Start your needs assessment</a>
              <a className={s.outline} href="#graph-scorecard">See the full scorecard</a>
            </div>
          </div>
          <Network selected={scorecard.selected} onToggle={scorecard.toggle} nameOf={nameOf} />
          <p className={own.caption}>
            Sample data for Fernwood Dental Group. Lines show verified scores of 4 or 5. Drag the graph, or focus it and use the arrow keys, to turn it.
          </p>
        </section>
      }
    />
  );
}
