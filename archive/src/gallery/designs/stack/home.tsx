"use client";

import clsx from "clsx";

import { vendors } from "../../kit/data";
import { mergeClasses } from "../../kit/parts-ui";
import { SoftHome } from "../../kit/soft-home";
import page from "../../kit/soft-page.module.css";
import p from "../../kit/soft-parts.module.css";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { display } from "./fonts";
import own from "./home.module.css";
import { StackDiagram } from "./layers";

const s = mergeClasses(page, own);

export default function StackHome() {
  const { theme, toggle } = useDesignTheme("stack", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="stack"
      s={s}
      p={p}
      className={clsx(s.root, display.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true"><i /><i /><i /></span>}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "Layer by layer, vendor by vendor.",
        scorecardText: "The same evidence as the diagram, in full. Choose up to five contenders; they appear as pegs on the stack.",
        stepsTitle: "From your stack to a signed contract.",
        stepsText: "Your advisor runs each step with you. You sign directly with the provider you choose.",
        caseTitle: "Your project, at a glance.",
        needsTitle: "Map your stack.",
        faqTitle: "Questions, answered.",
        closingTitle: "Build your HR stack on evidence.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="stack-hero-title">
          <div className={own.heroCopy}>
            <h1 id="stack-hero-title" className={own.heroTitle}>See your whole HR stack before you buy any of it.</h1>
            <p className={own.heroLede}>
              MatchMaker HR maps what your company needs, layer by layer, and shows which approved platforms cover each
              one. Names stay hidden until you meet your advisor. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#stack-needs">Start your needs assessment</a>
              <a className={s.outline} href="#stack-scorecard">See the full scorecard</a>
            </div>
          </div>
          <StackDiagram selected={scorecard.selected} nameOf={nameOf} />
        </section>
      }
    />
  );
}
