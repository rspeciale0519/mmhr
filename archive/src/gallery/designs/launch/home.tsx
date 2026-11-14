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
import { ProductWindow } from "./window";

const s = mergeClasses(page, own);

export default function LaunchHome() {
  const { theme, toggle } = useDesignTheme("launch", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="launch"
      s={s}
      p={p}
      className={clsx(s.root, display.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true" />}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "The comparison, in full.",
        scorecardText: "The window above is the real product view. Here is every score behind it. Choose up to five contenders.",
        stepsTitle: "Compare, request, decide.",
        stepsText: "Five steps with your advisor beside you. You sign directly with the provider you choose.",
        caseTitle: "Your case, after you sign in.",
        needsTitle: "Start your search.",
        faqTitle: "Questions, answered.",
        closingTitle: "Choose HR software with clear evidence.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="launch-hero-title">
          <div className={own.heroCopy}>
            <h1 id="launch-hero-title" className={own.heroTitle}>Compare, request, and decide on HR software in one place.</h1>
            <p className={own.heroLede}>
              MatchMaker HR scores every approved platform against your needs, sends one request to the contenders you
              choose, and keeps every reply side by side. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#launch-needs">Start your needs assessment</a>
              <a className={s.outline} href="#launch-scorecard">See the full scorecard</a>
            </div>
          </div>
          <ProductWindow selected={scorecard.selected} onToggle={scorecard.toggle} nameOf={nameOf} />
        </section>
      }
    />
  );
}
