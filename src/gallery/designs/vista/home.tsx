"use client";

import clsx from "clsx";

import { vendors } from "../../kit/data";
import { mergeClasses } from "../../kit/parts-ui";
import { SoftHome } from "../../kit/soft-home";
import page from "../../kit/soft-page.module.css";
import parts from "../../kit/soft-parts.module.css";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { body, display } from "./fonts";
import own from "./home.module.css";
import lift from "./parts.module.css";
import { VistaSpace } from "./space";

const s = mergeClasses(page, own);
const p = mergeClasses(parts, lift);

export default function VistaHome() {
  const { theme, toggle } = useDesignTheme("vista", "light");
  const scorecard = useScorecard();
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <SoftHome
      slug="vista"
      s={s}
      p={p}
      className={clsx(s.root, display.variable, body.variable)}
      theme={theme}
      onToggleTheme={toggle}
      brandMark={<span className={own.mark} aria-hidden="true" />}
      scorecard={scorecard}
      copy={{
        scorecardTitle: "Choose, and your picks come forward.",
        scorecardText: "Each contender you choose lifts toward you. Names stay hidden until you meet your advisor.",
        stepsTitle: "A clear view of every step.",
        stepsText: "Your advisor stays with you from the first answer to the signed contract.",
        caseTitle: "Your case, in plain view.",
        needsTitle: "Tell us what you need.",
        faqTitle: "Questions, answered.",
        closingTitle: "See your options clearly.",
      }}
      hero={
        <section className={own.hero} aria-labelledby="vista-hero-title">
          <div className={own.heroCopy}>
            <h1 id="vista-hero-title" className={own.heroTitle}>A clear view of the HR software that fits.</h1>
            <p className={own.heroLede}>
              MatchMaker HR checks every approved platform against your needs, shows you the evidence before the names,
              and stays with you to the contract. Your company never pays us.
            </p>
            <div className={own.heroActions}>
              <a className={s.solid} href="#vista-needs">Start your needs assessment</a>
              <a className={s.outline} href="#vista-scorecard">See a sample scorecard</a>
            </div>
          </div>
          <VistaSpace selected={scorecard.selected} nameOf={nameOf} />
        </section>
      }
    />
  );
}
