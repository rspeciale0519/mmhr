"use client";

import clsx from "clsx";
import { useState } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { activityUi, confirmUi, faqUi, formUi, menuUi, scorecardUi, sheetUi, traceUi } from "../../kit/parts-ui";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { body, display } from "./fonts";
import s from "./home.module.css";
import p from "./parts.module.css";
import { SiftStory } from "./story";

const nav = [
  ["#sift-scorecard", "Scorecard"],
  ["#sift-steps", "How it works"],
  ["#sift-case", "Your case"],
  ["#sift-faq", "Questions"],
] as const;

export default function SiftHome() {
  const { theme, toggle } = useDesignTheme("sift", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#sift-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#sift-main" aria-label="MatchMaker HR home">
            <span className={s.brandDots} aria-hidden="true"><i /><i /><i /></span>
            MatchMaker HR
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.headerButton} />
            <a className={clsx(s.headerButton, s.desktopOnly)} href="#sift-main">Sign in</a>
            <a className={clsx(s.headerCta, s.desktopOnly)} href="#sift-needs">Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.headerButton, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#sift-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="sift-main">
        <SiftStory selected={scorecard.selected} fontFamily={body.style.fontFamily} />

        <div className={s.main}>
          <section className={s.principles} aria-label="Our promises">
            {principles.map((item) => (
              <div key={item.title} className={s.principle}>
                <h2 className={s.principleTitle}>{item.title}</h2>
                <p className={s.principleText}>{item.body}</p>
              </div>
            ))}
          </section>

          <section id="sift-scorecard" className={s.section} aria-labelledby="sift-scorecard-title">
            <div className={s.sectionHead}>
              <h2 id="sift-scorecard-title" className={s.sectionTitle}>The six fits, side by side.</h2>
              <p className={s.sectionText}>
                Choose up to five contenders. Your choices fill in yellow in the story above, too.
              </p>
            </div>
            <Scorecard
              state={scorecard}
              title="Sample scorecard"
              subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
              renderScore={(score) => (
                <>
                  <span className={p.dots} aria-hidden="true">
                    {[1, 2, 3, 4, 5].map((step) => <i key={step} data-on={step <= score || undefined} />)}
                  </span>
                  <span className={p.scoreValue}>{score}</span>
                </>
              )}
              ui={scorecardUi(p)}
            />
          </section>

          <section id="sift-steps" className={s.section} aria-labelledby="sift-steps-title">
            <div className={s.sectionHead}>
              <h2 id="sift-steps-title" className={s.sectionTitle}>What happens after the shortlist.</h2>
            </div>
            <ol className={s.timeline}>
              {journey.map((step, index) => (
                <li key={step.title} className={s.timelineStep}>
                  <span className={s.timelineDot} aria-hidden="true">{index + 1}</span>
                  <h3 className={s.timelineTitle}>{step.title}</h3>
                  <p className={s.timelineText}>{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="sift-case" className={s.section} aria-labelledby="sift-case-title">
            <div className={s.sectionHead}>
              <h2 id="sift-case-title" className={s.sectionTitle}>Your case, one screen.</h2>
              <p className={s.sectionText}>After you sign in, you see the stage, each reply, and what needs you next.</p>
            </div>
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
              <aside className={p.next} aria-labelledby="sift-next-title">
                <p className={p.nextLabel}>Waiting for you</p>
                <h3 id="sift-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
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
          </section>

          <section id="sift-needs" className={s.section} aria-labelledby="sift-needs-title">
            <div className={s.split}>
              <div className={s.sectionHead}>
                <h2 id="sift-needs-title" className={s.sectionTitle}>Your needs are the filter.</h2>
                <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
              </div>
              <div className={p.formPanel}><NeedsForm ui={formUi(p)} /></div>
            </div>
          </section>

          <section id="sift-faq" className={s.section} aria-labelledby="sift-faq-title">
            <div className={s.split}>
              <div className={s.sectionHead}>
                <h2 id="sift-faq-title" className={s.sectionTitle}>Good questions.</h2>
              </div>
              <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
            </div>
          </section>
        </div>
      </main>

      <section className={s.closing} aria-labelledby="sift-closing-title">
        <div className={s.closingInner}>
          <h2 id="sift-closing-title" className={s.closingTitle}>Skip the 114 that do not fit.</h2>
          <a className={s.closingCta} href="#sift-needs">Start your needs assessment</a>
        </div>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}><span className={s.brandDots} aria-hidden="true"><i /><i /><i /></span>MatchMaker HR</span>
        <p>Sample design for review. All companies, people, vendors, and market numbers shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
