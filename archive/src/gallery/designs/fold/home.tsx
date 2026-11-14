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
import { Leaflet } from "./leaflet";
import { Sheets } from "./sheets";

const s = mergeClasses(page, own);

export default function FoldHome() {
  const { theme, toggle } = useDesignTheme("fold", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="fold"
      s={s}
      p={p}
      className={clsx(s.root, display.variable, body.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true" />}
      scorecard={scorecard}
      steps={<Leaflet />}
      copy={{
        scorecardTitle: "Every option on one sheet.",
        scorecardText: "Choose up to five contenders. Names stay hidden until you review your needs with your advisor.",
        stepsTitle: "Your search, unfolded.",
        stepsText: "Keep scrolling and the leaflet opens one step at a time.",
        caseTitle: "Your case, neatly filed.",
        needsTitle: "Start with a clean sheet.",
        faqTitle: "Questions, answered.",
        closingTitle: "Everything you need, on one page.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="fold-hero-title">
          <div className={own.heroCopy}>
            <h1 id="fold-hero-title" className={own.heroTitle}>Your HR software search, kept simple.</h1>
            <p className={own.heroLede}>
              Write down what your company needs once. MatchMaker HR compares every approved platform, keeps the names
              hidden until you are ready, and sends one request for you. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#fold-needs">Start your needs assessment</a>
              <a className={s.outline} href="#fold-steps">See how it works</a>
            </div>
          </div>
          <Sheets selected={scorecard.selected} nameOf={nameOf} />
        </section>
      }
    />
  );
}
