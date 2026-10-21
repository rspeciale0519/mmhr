"use client";

import clsx from "clsx";

import { vendors } from "../../kit/data";
import { mergeClasses } from "../../kit/parts-ui";
import { SoftHome } from "../../kit/soft-home";
import page from "../../kit/soft-page.module.css";
import p from "../../kit/soft-parts.module.css";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { QueryConsole } from "./console";
import { display, mono } from "./fonts";
import own from "./home.module.css";

const s = mergeClasses(page, own);

export default function QueryHome() {
  const { theme, toggle } = useDesignTheme("query", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="query"
      s={s}
      p={p}
      className={clsx(s.root, display.variable, mono.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true">{"{ }"}</span>}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "The full response, criterion by criterion.",
        scorecardText: "Every score comes from approved evidence. Choose up to five contenders for your request.",
        stepsTitle: "How a search runs.",
        stepsText: "Five steps, each one with your advisor. You sign directly with the provider you choose.",
        caseTitle: "Your case, in one view.",
        needsTitle: "Describe your requirements.",
        faqTitle: "Questions, answered.",
        closingTitle: "Send one request. Get ranked answers.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="query-hero-title">
          <div className={own.heroCopy}>
            <h1 id="query-hero-title" className={own.heroTitle}>Describe what you need once. Get every platform ranked against it.</h1>
            <p className={own.heroLede}>
              MatchMaker HR turns your requirements into one structured request and scores every approved HR platform on
              evidence. Names stay hidden until you meet your advisor. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#query-needs">Start your needs assessment</a>
              <a className={s.outline} href="#query-scorecard">See the full scorecard</a>
            </div>
          </div>
          <QueryConsole selected={scorecard.selected} nameOf={nameOf} />
        </section>
      }
    />
  );
}
