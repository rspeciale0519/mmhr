"use client";

import clsx from "clsx";
import { useRef, useState, type CSSProperties } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { activityUi, confirmUi, faqUi, formUi, menuUi, scorecardUi, sheetUi, traceUi } from "../../kit/parts-ui";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useInView } from "../../kit/use-in-view";
import { useScorecard } from "../../kit/use-scorecard";
import { useScrollProgress } from "../../kit/use-scroll-progress";
import { display } from "./fonts";
import s from "./home.module.css";
import { Marquee, usePinnedTrack, useScrollVelocity } from "./kinetic";
import p from "./parts.module.css";

const nav = [
  ["#velocity-scorecard", "Scorecard"],
  ["#velocity-journey", "How it works"],
  ["#velocity-case", "Your case"],
  ["#velocity-faq", "Questions"],
] as const;

/** Vertical scroll drives the steps sideways while the section is pinned. */
function Journey() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const move = usePinnedTrack(sectionRef, trackRef);
  useScrollProgress(sectionRef, move);

  return (
    <section ref={sectionRef} id="velocity-journey" className={s.journey} aria-labelledby="velocity-journey-title">
      <div className={s.journeySticky}>
        <h2 id="velocity-journey-title" className={s.journeyTitle}>Needs to signature in five moves.</h2>
        <ol ref={trackRef} className={s.journeyTrack}>
          {journey.map((step, index) => (
            <li key={step.title} className={s.journeyPanel} data-tone={index % 3} style={{ "--i": index } as CSSProperties}>
              <span className={s.journeyNumber} aria-hidden="true">{index + 1}</span>
              <h3 className={s.journeyStep}>{step.title}</h3>
              <p className={s.journeyText}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function VelocityHome() {
  const { theme, toggle } = useDesignTheme("velocity", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoresSeen = useInView(scoreRef, 0.2);
  useScrollVelocity(pageRef);

  return (
    <DesignRoot className={clsx(s.root, display.variable)} theme={theme}>
      <div ref={pageRef} className={s.page}>
        <a className={s.skip} href="#velocity-main">Skip to content</a>
        <header className={s.header}>
          <div className={s.headerInner}>
            <a className={s.brand} href="#velocity-main" aria-label="MatchMaker HR home">
              <span className={s.brandMark} aria-hidden="true">MM</span>
              <span className={s.brandName}>MatchMaker HR</span>
            </a>
            <nav className={s.nav} aria-label="Main">
              {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            </nav>
            <div className={s.headerActions}>
              <ThemeToggle theme={theme} onToggle={toggle} className={s.headerButton} />
              <a className={clsx(s.headerButton, s.desktopOnly)} href="#velocity-main">Sign in</a>
              <a className={clsx(s.headerCta, s.desktopOnly)} href="#velocity-needs">Get started</a>
              <MobileNav ui={sheetUi(s, clsx(s.headerButton, s.mobileOnly))} triggerLabel="Menu">
                {nav.map(([href, label]) => (
                  <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
                ))}
                <SheetLink asChild><a className={s.sheetLink} href="#velocity-needs">Get started</a></SheetLink>
              </MobileNav>
            </div>
          </div>
        </header>

        <main id="velocity-main">
          <section className={s.hero} aria-labelledby="velocity-hero-title">
            <Marquee />
            <div className={s.heroBody}>
              <h1 id="velocity-hero-title" className={s.heroTitle}>Skip forty sales calls. Send one request.</h1>
              <div className={s.heroAside}>
                <p className={s.heroLede}>
                  Tell MatchMaker HR what your company needs. We compare every approved HR platform on evidence, send one
                  request to the contenders you choose, and stay with you to the contract. You never pay us.
                </p>
                <div className={s.heroActions}>
                  <a className={s.flareButton} href="#velocity-needs">Start your needs assessment</a>
                  <a className={s.inkButton} href="#velocity-scorecard">See a sample scorecard</a>
                </div>
              </div>
            </div>
          </section>

          <section className={s.rules} aria-label="Our promises">
            {principles.map((item) => (
              <div key={item.title} className={s.rule}>
                <h2 className={s.ruleTitle}>{item.title}</h2>
                <p className={s.ruleText}>{item.body}</p>
              </div>
            ))}
          </section>

          <section id="velocity-scorecard" className={s.section} aria-labelledby="velocity-scorecard-title">
            <div className={s.inner}>
              <h2 id="velocity-scorecard-title" className={s.sectionTitle}>Six fits. Zero logos.</h2>
              <p className={s.sectionText}>Every option, scored on evidence, with names hidden until you meet your advisor. Choose up to five.</p>
              <div ref={scoreRef} className={p.scoreWrap} data-seen={scoresSeen || undefined}>
                <Scorecard
                  state={scorecard}
                  title="Sample scorecard"
                  subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
                  renderScore={(score) => (
                    <>
                      <span className={p.bar} aria-hidden="true"><i /></span>
                      <span className={p.scoreValue}>{score}</span>
                    </>
                  )}
                  ui={scorecardUi(p)}
                />
              </div>
            </div>
          </section>

          <Journey />

          <section id="velocity-case" className={s.section} aria-labelledby="velocity-case-title">
            <div className={s.inner}>
              <h2 id="velocity-case-title" className={s.sectionTitle}>Your case, at a glance.</h2>
              <p className={s.sectionText}>After you sign in: where it stands, who replied, and what needs you next.</p>
              <div className={p.caseGrid}>
                <article className={p.panel} aria-label="Sample case">
                  <div className={p.panelTop}>
                    <div>
                      <p className={p.company}>{caseSummary.company}</p>
                      <p className={p.goal}>{caseSummary.employees} employees. {caseSummary.goal}.</p>
                    </div>
                    <CaseActionsMenu ui={menuUi(p)} onSelect={setMenuResult} />
                  </div>
                  <StageTrace ui={traceUi(p)} />
                  <p className={p.inlineStatus} role="status" aria-live="polite">{menuResult}</p>
                  <CaseActivity ui={activityUi(p)} />
                </article>
                <aside className={p.next} aria-labelledby="velocity-next-title">
                  <p className={p.nextLabel}>Your move</p>
                  <h3 id="velocity-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
                  <dl className={p.facts}>
                    <div><dt>Advisor</dt><dd>{caseSummary.advisor}</dd></div>
                    <div><dt>Due</dt><dd>{caseSummary.due}</dd></div>
                  </dl>
                  <ConfirmApproval ui={confirmUi(p)} />
                  <div className={p.labels} aria-label="Status examples">
                    <StatusLabel tone="success" className={p.status}>On track</StatusLabel>
                    <StatusLabel tone="info" className={p.status}>Waiting for you</StatusLabel>
                    <StatusLabel tone="warning" className={p.status}>Due in 3 days</StatusLabel>
                    <StatusLabel tone="danger" className={p.status}>Overdue</StatusLabel>
                  </div>
                  <div className={p.buttons} aria-label="Button examples">
                    <button type="button" className={p.outlineButton}>Save draft</button>
                    <button type="button" className={p.dangerButton}>Withdraw</button>
                    <button type="button" className={p.primaryButton} disabled>Send to vendors</button>
                  </div>
                </aside>
              </div>
            </div>
          </section>

          <section id="velocity-needs" className={s.section} aria-labelledby="velocity-needs-title">
            <div className={clsx(s.inner, s.split)}>
              <div>
                <h2 id="velocity-needs-title" className={s.sectionTitle}>Ten minutes. Then we move.</h2>
                <p className={s.sectionText}>Saved as you go. Your advisor sees it only after you submit.</p>
              </div>
              <div className={p.formPanel}><NeedsForm ui={formUi(p)} /></div>
            </div>
          </section>

          <section id="velocity-faq" className={s.section} aria-labelledby="velocity-faq-title">
            <div className={clsx(s.inner, s.split)}>
              <h2 id="velocity-faq-title" className={s.sectionTitle}>Fast answers.</h2>
              <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
            </div>
          </section>
        </main>

        <section className={s.closing} aria-labelledby="velocity-closing-title">
          <h2 id="velocity-closing-title" className={s.closingTitle}>Send one request.</h2>
          <a className={s.inkButton} href="#velocity-needs">Start your needs assessment</a>
        </section>

        <footer className={s.footer}>
          <span className={s.brand}><span className={s.brandMark} aria-hidden="true">MM</span><span className={s.brandName}>MatchMaker HR</span></span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </footer>
      </div>
    </DesignRoot>
  );
}
