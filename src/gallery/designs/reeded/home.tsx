"use client";

import clsx from "clsx";
import { useState, type CSSProperties } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import base from "../../kit/kit.module.css";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { activityUi, confirmUi, faqUi, formUi, menuUi, scorecardUi, sheetUi, traceUi } from "../../kit/parts-ui";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { useScramble } from "../../kit/use-scramble";
import { body, display } from "./fonts";
import { ReededHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#reeded-scorecard", "Scorecard"],
  ["#reeded-steps", "How it works"],
  ["#reeded-case", "Your case"],
  ["#reeded-faq", "Questions"],
] as const;

/** Vendor names decode letter by letter when the disclosure preview changes. */
function Decoding({ label }: { label: string }) {
  const shown = useScramble(label);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className={base.srOnly}>{label}</span>
    </>
  );
}

function FluteMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {[3, 7.5, 12, 16.5, 21].map((x) => <rect key={x} x={x - 1.6} y="3" width="3.2" height="18" rx="1.6" />)}
    </svg>
  );
}

export default function ReededHome() {
  const { theme, toggle } = useDesignTheme("reeded", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#reeded-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#reeded-main" aria-label="MatchMaker HR home">
            <FluteMark className={s.mark} />
            MatchMaker HR
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.textButton} />
            <a className={clsx(s.textButton, s.desktopOnly)} href="#reeded-main">Sign in</a>
            <a className={clsx(s.headerCta, s.desktopOnly)} href="#reeded-needs">Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.textButton, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#reeded-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="reeded-main" className={s.main}>
        <ReededHero />

        <section className={s.principles} aria-label="Our promises">
          {principles.map((item) => (
            <div key={item.title} className={s.principle}>
              <h2 className={s.principleTitle}>{item.title}</h2>
              <p className={s.principleText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="reeded-scorecard" className={s.section} aria-labelledby="reeded-scorecard-title">
          <div className={s.sectionHead}>
            <h2 id="reeded-scorecard-title" className={s.sectionTitle}>The comparison, with the names behind glass.</h2>
            <p className={s.sectionText}>
              Choose up to five contenders. Turn on the preview to see how names appear after your advisor reviews your
              needs with you.
            </p>
          </div>
          <Scorecard
            state={scorecard}
            title="Sample scorecard"
            subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
            renderName={(label) => <Decoding label={label} />}
            renderScore={(score) => (
              <>
                <span className={p.flutes} aria-hidden="true" />
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={scorecardUi(p)}
          />
        </section>

        <section id="reeded-steps" className={s.section} aria-labelledby="reeded-steps-title">
          <div className={s.sectionHead}>
            <h2 id="reeded-steps-title" className={s.sectionTitle}>Five steps, each one clearer than the last.</h2>
          </div>
          <ol className={s.panes}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.pane} style={{ "--i": index } as CSSProperties}>
                <span className={s.paneNumber} aria-hidden="true">{index + 1}</span>
                <h3 className={s.paneTitle}>{step.title}</h3>
                <p className={s.paneText}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="reeded-case" className={s.section} aria-labelledby="reeded-case-title">
          <div className={s.sectionHead}>
            <h2 id="reeded-case-title" className={s.sectionTitle}>Your case, clearly.</h2>
            <p className={s.sectionText}>After you sign in, your case shows its stage, every reply, and the one thing that needs you next.</p>
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
            <aside className={p.next} aria-labelledby="reeded-next-title">
              <p className={p.nextLabel}>Next, for you</p>
              <h3 id="reeded-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
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

        <section id="reeded-needs" className={s.section} aria-labelledby="reeded-needs-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="reeded-needs-title" className={s.sectionTitle}>Begin with your needs.</h2>
              <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
            </div>
            <NeedsForm ui={formUi(p)} />
          </div>
        </section>

        <section id="reeded-faq" className={s.section} aria-labelledby="reeded-faq-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="reeded-faq-title" className={s.sectionTitle}>Questions people ask first.</h2>
            </div>
            <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
          </div>
        </section>
      </main>

      <section className={s.closing} aria-labelledby="reeded-closing-title">
        <div className={s.closingInner}>
          <h2 id="reeded-closing-title" className={s.closingTitle}>Clear evidence. No fee to you.</h2>
          <a className={s.closingCta} href="#reeded-needs">Start your needs assessment</a>
        </div>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}><FluteMark className={s.mark} />MatchMaker HR</span>
        <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
