"use client";

import clsx from "clsx";
import { useRef, type CSSProperties } from "react";

import { FaqList, ThemeToggle } from "../../kit/bits";
import { CaseBoard } from "../../kit/case-board";
import { journey, principles, vendors } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { MobileNav, SheetLink } from "../../kit/overlays";
import { faqUi, formUi, scorecardUi, sheetUi } from "../../kit/parts-ui";
import { Scorecard } from "../../kit/scorecard";
import p from "../../kit/soft-parts.module.css";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { display } from "./fonts";
import s from "./home.module.css";
import { LightTable } from "./light";

const nav = [
  ["#lumen-scorecard", "Scorecard"],
  ["#lumen-steps", "How it works"],
  ["#lumen-case", "Your case"],
  ["#lumen-faq", "Questions"],
] as const;

export default function LumenHome() {
  const { theme, toggle } = useDesignTheme("lumen", "light");
  const scorecard = useScorecard();
  const rootRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <DesignRoot className={clsx(s.root, display.variable)} theme={theme} rootRef={rootRef}>
      <a className={s.skip} href="#lumen-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#lumen-main" aria-label="MatchMaker HR home">
            <span className={s.brandSun} aria-hidden="true" />
            MatchMaker HR
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.quiet} />
            <a className={clsx(s.quiet, s.desktopOnly)} href="#lumen-main">Sign in</a>
            <a className={clsx(s.solid, s.desktopOnly)} href="#lumen-needs">Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.quiet, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#lumen-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="lumen-main" className={s.main}>
        <section className={s.hero} aria-labelledby="lumen-hero-title">
          <h1 id="lumen-hero-title" className={s.heroTitle}>See every HR platform in a clear light.</h1>
          <p className={s.heroLede}>
            MatchMaker HR scores every approved platform against your needs. Names stay hidden until you talk it through
            with your advisor, so the evidence decides. Your company never pays us.
          </p>
          <div className={s.heroActions}>
            <a className={s.solid} href="#lumen-needs">Start your needs assessment</a>
            <a className={s.outline} href="#lumen-scorecard">See a sample scorecard</a>
          </div>
          <LightTable
            rootRef={rootRef}
            selected={scorecard.selected}
            onToggle={scorecard.toggle}
            nameOf={nameOf}
            count={scorecard.count}
            max={scorecard.max}
          />
        </section>

        <section className={s.promises} aria-label="Our promises">
          {principles.map((item, index) => (
            <div key={item.title} className={s.promise} style={{ "--h": 14 + index * 10 } as CSSProperties}>
              <h2 className={s.promiseTitle}>{item.title}</h2>
              <p className={s.promiseText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="lumen-scorecard" className={s.section} aria-labelledby="lumen-scorecard-title">
          <div className={s.sectionHead}>
            <h2 id="lumen-scorecard-title" className={s.sectionTitle}>The evidence, side by side.</h2>
            <p className={s.sectionText}>Your choices on the table above appear here too. Open Evidence to see where each score came from.</p>
          </div>
          <Scorecard
            state={scorecard}
            title="Sample scorecard"
            subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
            renderScore={(score) => (
              <>
                <span className={p.meter} aria-hidden="true"><i /></span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={scorecardUi(p)}
          />
        </section>

        <section id="lumen-steps" className={s.section} aria-labelledby="lumen-steps-title">
          <div className={s.sectionHead}>
            <h2 id="lumen-steps-title" className={s.sectionTitle}>Five steps up.</h2>
            <p className={s.sectionText}>Your advisor takes each step with you. You sign directly with the provider you choose.</p>
          </div>
          <ol className={s.stairs}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.stair} style={{ "--h": 6 + index * 7, "--i": index } as CSSProperties}>
                <span className={s.stairNumber} aria-hidden="true">{index + 1}</span>
                <h3 className={s.stairTitle}>{step.title}</h3>
                <p className={s.stairText}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="lumen-case" className={s.section} aria-labelledby="lumen-case-title">
          <div className={s.sectionHead}>
            <h2 id="lumen-case-title" className={s.sectionTitle}>Your case, at a glance.</h2>
            <p className={s.sectionText}>After you sign in: the stage, each reply, and the one thing that needs you next.</p>
          </div>
          <CaseBoard p={p} id="lumen" />
        </section>

        <section id="lumen-needs" className={s.section} aria-labelledby="lumen-needs-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="lumen-needs-title" className={s.sectionTitle}>Tell us what you need.</h2>
              <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
            </div>
            <div className={p.formPanel}><NeedsForm ui={formUi(p)} /></div>
          </div>
        </section>

        <section id="lumen-faq" className={s.section} aria-labelledby="lumen-faq-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="lumen-faq-title" className={s.sectionTitle}>Questions, answered.</h2>
            </div>
            <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
          </div>
        </section>
      </main>

      <section className={s.closing} aria-labelledby="lumen-closing-title" style={{ "--h": 40 } as CSSProperties}>
        <h2 id="lumen-closing-title" className={s.closingTitle}>Find the platform that fits.</h2>
        <p className={s.closingText}>Free for your company. Vendors pay a referral fee that never touches a score.</p>
        <a className={s.solid} href="#lumen-needs">Start your needs assessment</a>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}><span className={s.brandSun} aria-hidden="true" />MatchMaker HR</span>
        <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
