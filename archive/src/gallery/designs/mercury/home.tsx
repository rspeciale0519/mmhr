"use client";

import clsx from "clsx";
import { useRef, useState } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles, vendors } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { activityUi, confirmUi, faqUi, formUi, menuUi, scorecardUi, sheetUi, traceUi } from "../../kit/parts-ui";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { useScrollProgress } from "../../kit/use-scroll-progress";
import { body, display } from "./fonts";
import { MercuryHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#mercury-scorecard", "Evidence"],
  ["#mercury-flow", "How it works"],
  ["#mercury-case", "Your case"],
  ["#mercury-faq", "Questions"],
] as const;

/** A chrome bead travels down the line as you scroll; each step lights when it arrives. */
function Flow() {
  const listRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  useScrollProgress(listRef, (progress) => {
    const list = listRef.current;
    if (!list) return;
    const reach = progress * list.clientHeight;
    stepRefs.current.forEach((step) => {
      if (step) step.toggleAttribute("data-reached", step.offsetTop + 24 <= reach);
    });
  }, { mode: "anchor", anchor: 0.62 });

  return (
    <div ref={listRef} className={s.flow}>
      <span className={s.flowTrack} aria-hidden="true"><span className={s.flowFill} /><span className={s.flowBead} /></span>
      <ol className={s.flowList}>
      {journey.map((step, index) => (
        <li key={step.title} ref={(node) => { stepRefs.current[index] = node; }} className={s.flowStep}>
          <h3 className={s.flowTitle}>{step.title}</h3>
          <p className={s.flowText}>{step.body}</p>
        </li>
      ))}
      </ol>
    </div>
  );
}

export default function MercuryHome() {
  const { theme, toggle } = useDesignTheme("mercury", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#mercury-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#mercury-main" aria-label="MatchMaker HR home">
            <span className={s.brandBead} aria-hidden="true" />
            MatchMaker HR
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.ghost} />
            <a className={clsx(s.ghost, s.desktopOnly)} href="#mercury-main">Sign in</a>
            <a className={clsx(s.cta, s.desktopOnly)} href="#mercury-needs">Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.ghost, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#mercury-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="mercury-main" className={s.main}>
        <MercuryHero
          selected={scorecard.selected}
          onToggle={scorecard.toggle}
          nameOf={nameOf}
          dark={theme === "dark"}
          count={scorecard.count}
          max={scorecard.max}
        />

        <section className={s.promises} aria-label="Our promises">
          {principles.map((item) => (
            <div key={item.title} className={s.promise}>
              <span className={s.promiseBead} aria-hidden="true" />
              <h2 className={s.promiseTitle}>{item.title}</h2>
              <p className={s.promiseText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="mercury-scorecard" className={s.section} aria-labelledby="mercury-evidence-title">
          <div className={s.sectionHead}>
            <h2 id="mercury-evidence-title" className={s.sectionTitle}>Compare the evidence, not the logos.</h2>
            <p className={s.sectionText}>
              The same choices you make in the drops above appear here. Each score comes from approved evidence;
              open Evidence to see where it came from.
            </p>
          </div>
          <Scorecard
            state={scorecard}
            title="Sample comparison"
            subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
            renderScore={(score) => (
              <>
                <span className={p.drop} aria-hidden="true" />
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={scorecardUi(p)}
          />
        </section>

        <section id="mercury-flow" className={s.section} aria-labelledby="mercury-flow-title">
          <div className={s.sectionHead}>
            <h2 id="mercury-flow-title" className={s.sectionTitle}>One search, start to signature.</h2>
            <p className={s.sectionText}>Your advisor stays with you at every step. You sign directly with the provider you choose.</p>
          </div>
          <Flow />
        </section>

        <section id="mercury-case" className={s.section} aria-labelledby="mercury-case-title">
          <div className={s.sectionHead}>
            <h2 id="mercury-case-title" className={s.sectionTitle}>Your case, in one place.</h2>
            <p className={s.sectionText}>This is what you see after you sign in: progress, replies, and what needs you next.</p>
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
            <aside className={p.next} aria-labelledby="mercury-next-title">
              <p className={p.nextLabel}>Waiting for you</p>
              <h3 id="mercury-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
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

        <section id="mercury-needs" className={s.section} aria-labelledby="mercury-needs-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="mercury-needs-title" className={s.sectionTitle}>Tell us what you need.</h2>
              <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
            </div>
            <div className={p.formCard}><NeedsForm ui={formUi(p)} /></div>
          </div>
        </section>

        <section id="mercury-faq" className={s.section} aria-labelledby="mercury-faq-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="mercury-faq-title" className={s.sectionTitle}>Questions, answered.</h2>
            </div>
            <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
          </div>
        </section>
      </main>

      <section className={s.closing} aria-labelledby="mercury-closing-title">
        <h2 id="mercury-closing-title" className={s.closingTitle}>Find your fit.</h2>
        <p className={s.closingText}>Free for your company. Vendors pay a referral fee that never touches a score.</p>
        <a className={s.cta} href="#mercury-needs">Start your needs assessment</a>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}><span className={s.brandBead} aria-hidden="true" />MatchMaker HR</span>
        <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
