"use client";

import clsx from "clsx";

import { vendors } from "../../kit/data";
import page from "../../kit/soft-page.module.css";
import p from "../../kit/soft-parts.module.css";
import { mergeClasses } from "../../kit/parts-ui";
import { SoftHome } from "../../kit/soft-home";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { display } from "./fonts";
import own from "./home.module.css";
import { HaloRing } from "./ring";

const s = mergeClasses(page, own);

export default function HaloHome() {
  const { theme, toggle } = useDesignTheme("halo", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="halo"
      s={s}
      p={p}
      className={clsx(s.root, display.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true" />}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "Every score, in one view.",
        scorecardText: "The cards above and this table share your choices. Turn on the preview to see how names appear later.",
        stepsTitle: "How a search comes full circle.",
        stepsText: "Your advisor stays with you at every step. You sign directly with the provider you choose.",
        caseTitle: "Your case, at a glance.",
        needsTitle: "Start with your needs.",
        faqTitle: "Questions, answered.",
        closingTitle: "Find the one that fits.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="halo-hero-title">
          <div className={own.heroCopy}>
            <h1 id="halo-hero-title" className={own.heroTitle}>Six good fits. Turn them over before you talk to anyone.</h1>
            <div className={own.heroAside}>
              <p className={own.heroLede}>
                MatchMaker HR scores every approved HR platform against your needs and keeps names hidden until you meet
                your advisor. Look at the evidence, choose up to five, and never pay us.
              </p>
              <div className={own.heroActions}>
                <a className={s.solid} href="#halo-needs">Start your needs assessment</a>
                <a className={s.outline} href="#halo-scorecard">See the full scorecard</a>
              </div>
            </div>
          </div>
          <HaloRing
            selected={scorecard.selected}
            onToggle={scorecard.toggle}
            nameOf={nameOf}
            count={scorecard.count}
            max={scorecard.max}
          />
        </section>
      }
    />
  );
}
