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
import { RadarStack } from "./radar";

const s = mergeClasses(page, own);

export default function RadarHome() {
  const { theme, toggle } = useDesignTheme("radar", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="radar"
      s={s}
      p={p}
      className={clsx(s.root, display.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true" />}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "The numbers behind every shape.",
        scorecardText: "Each point on a radar is a score here. Choose up to five contenders; they light up above.",
        stepsTitle: "From shortlist to signature.",
        stepsText: "Five steps, each one with your advisor. You sign directly with the provider you choose.",
        caseTitle: "Your case, in focus.",
        needsTitle: "Set your requirements.",
        faqTitle: "Questions, answered.",
        closingTitle: "See the shape of the right fit.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="radar-hero-title">
          <div className={own.heroCopy}>
            <h1 id="radar-hero-title" className={own.heroTitle}>Every HR platform has a shape. Find the one that matches yours.</h1>
            <p className={own.heroLede}>
              MatchMaker HR scores every approved platform on each requirement and draws the result, so strengths and gaps
              are clear at a glance. Names stay hidden until you meet your advisor. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#radar-needs">Start your needs assessment</a>
              <a className={s.outline} href="#radar-scorecard">See the full scorecard</a>
            </div>
          </div>
          <RadarStack selected={scorecard.selected} onToggle={scorecard.toggle} nameOf={nameOf} />
          <p className={own.caption}>
            Sample data for Fernwood Dental Group. Points further out are stronger scores. Drag the chart, or focus it and use the arrow keys, to turn it.
          </p>
        </section>
      }
    />
  );
}
