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
import { PlinthScene } from "./scene";

const s = mergeClasses(page, own);

export default function PlinthHome() {
  const { theme, toggle } = useDesignTheme("plinth", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="plinth"
      s={s}
      p={p}
      className={clsx(s.root, display.variable, body.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true"><i /><i /><i /></span>}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "The full record behind each plinth.",
        scorecardText: "Every height above comes from these scores. Open Evidence to see the source of each one.",
        stepsTitle: "From first look to signed contract.",
        stepsText: "Five steps, each one taken with your advisor. You sign directly with the provider you choose.",
        caseTitle: "Your case, in one room.",
        needsTitle: "Tell us what matters to you.",
        faqTitle: "Questions visitors ask.",
        closingTitle: "See every option at its true height.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="plinth-hero-title">
          <div className={own.heroCopy}>
            <h1 id="plinth-hero-title" className={own.heroTitle}>Every HR platform, measured against what you need.</h1>
            <p className={own.heroLede}>
              Switch a requirement off and watch the fits change. MatchMaker HR shows you the evidence first and the names
              later, and your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#plinth-needs">Start your needs assessment</a>
              <a className={s.outline} href="#plinth-scorecard">Read the full scorecard</a>
            </div>
          </div>
          <PlinthScene selected={scorecard.selected} onToggle={scorecard.toggle} nameOf={nameOf} />
          <p className={own.caption}>
            A sample search for Fernwood Dental Group. Heights show fit for the requirements switched on. Drag the room, or
            focus it and use the arrow keys, to walk around.
          </p>
        </section>
      }
    />
  );
}
