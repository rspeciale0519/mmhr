"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { body, display } from "./fonts";
import { MarginHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#margin-how", "How it works"],
  ["#margin-scorecard", "Comparison"],
  ["#margin-case", "Your case"],
  ["#margin-faq", "Questions"],
] as const;

function Note({ children }: { children: ReactNode }) {
  return <p className={s.note}>{children}</p>;
}

export default function MarginHome() {
  const { theme, toggle } = useDesignTheme("margin", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#margin-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#margin-main" aria-label="MatchMaker HR home">
            MatchMaker <span className={s.brandHr}>HR</span>
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.textButton}>
              {theme === "dark" ? "Day" : "Night"}
            </ThemeToggle>
            <a className={s.signIn} href="#margin-main">Sign in</a>
            <MobileNav
              ui={{ trigger: s.textButton, overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody }}
              triggerLabel="Menu"
            >
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#margin-needs">Start your needs assessment</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="margin-main" className={s.main}>
        <MarginHero />

        <section className={s.section} aria-labelledby="margin-terms-title">
          <div className={s.sectionMain}>
            <h2 id="margin-terms-title" className={s.sectionTitle}>Our terms, in plain words</h2>
            <div className={s.terms}>
              {principles.map((item) => (
                <div key={item.title} className={s.term}>
                  <h3 className={s.termTitle}>{item.title}</h3>
                  <p className={s.termText}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
          <Note>We wrote these down so you can hold us to them.</Note>
        </section>

        <section id="margin-how" className={s.section} aria-labelledby="margin-how-title">
          <div className={s.sectionMain}>
            <h2 id="margin-how-title" className={s.sectionTitle}>How a search runs</h2>
            <ol className={s.steps}>
              {journey.map((step, index) => (
                <li key={step.title} className={s.step}>
                  <span className={s.stepNumber} aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3 className={s.stepTitle}>{step.title}</h3>
                    <p className={s.stepText}>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Note>Most searches take four to eight weeks. You decide the pace.</Note>
        </section>

        <section id="margin-scorecard" className={s.wideSection} aria-labelledby="margin-scorecard-title">
          <div className={s.sectionMain}>
            <h2 id="margin-scorecard-title" className={s.sectionTitle}>Exhibit A: a sample comparison</h2>
            <p className={s.sectionText}>Scores run from 0 to 5 and come only from approved evidence. Red pencil marks what we have not verified yet.</p>
          </div>
          <Scorecard
            state={scorecard}
            title="Fernwood Dental Group, payroll and benefits"
            pickLabel={(selected) => (selected ? "On shortlist" : "Add")}
            renderScore={(score) => (
              <>
                <span className={p.tally} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((index) => <i key={index} data-on={index < score || undefined} />)}
                </span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={{
              root: p.exhibit, head: p.exhibitHead, title: p.exhibitTitle, subtitle: p.exhibitText, toolbar: p.toolbar, count: p.count,
              countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb, scroller: p.scroller,
              table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit, pick: p.pick,
              evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle, evidenceText: p.popoverText,
              criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell, score: p.score,
              unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
            }}
          />
        </section>

        <section id="margin-case" className={s.section} aria-labelledby="margin-case-title">
          <div className={s.sectionMain}>
            <h2 id="margin-case-title" className={s.sectionTitle}>Where your case stands</h2>
            <article className={p.memo} aria-label="Sample case">
              <div className={p.memoHead}>
                <div>
                  <p className={p.memoCompany}>{caseSummary.company}</p>
                  <p className={p.memoGoal}>{caseSummary.employees} employees. {caseSummary.goal}.</p>
                </div>
                <CaseActionsMenu
                  ui={{ trigger: p.ghostButton, content: p.menu, item: p.menuItem, danger: p.menuDanger, separator: p.menuSeparator, label: p.menuLabel }}
                  onSelect={setMenuResult}
                />
              </div>
              <StageTrace ui={{ root: p.trace, item: p.traceItem, marker: p.traceMarker, label: p.traceLabel }} />
              <p className={p.inlineStatus} role="status" aria-live="polite">{menuResult}</p>
              <div className={p.memoGrid}>
                <CaseActivity
                  ui={{
                    root: p.tabs, list: p.tabList, trigger: p.tab, panel: p.tabPanel, rows: p.rows, row: p.row, rowTitle: p.rowTitle,
                    rowMeta: p.rowMeta, status: p.status, empty: p.empty, emptyTitle: p.emptyTitle, emptyText: p.emptyText,
                    emptyAction: p.ghostButton, skeleton: p.skeleton, skeletonLine: p.skeletonLine, reload: p.linkButton,
                  }}
                />
                <aside className={p.next} aria-labelledby="margin-next-title">
                  <h3 id="margin-next-title" className={p.nextTitle}>Next: {caseSummary.nextAction.toLowerCase()}</h3>
                  <p className={p.nextMeta}>You and {caseSummary.advisor}, by {caseSummary.due}</p>
                  <ConfirmApproval
                    ui={{
                      trigger: p.primaryButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
                      actions: p.dialogActions, cancel: p.ghostButton, confirm: p.primaryButton, result: p.inlineStatus,
                    }}
                  />
                </aside>
              </div>
              <div className={p.samples}>
                <div className={p.labels} aria-label="Status examples">
                  <StatusLabel tone="success" className={p.status}>On track</StatusLabel>
                  <StatusLabel tone="info" className={p.status}>Waiting for you</StatusLabel>
                  <StatusLabel tone="warning" className={p.status}>Due in 3 days</StatusLabel>
                  <StatusLabel tone="danger" className={p.status}>Overdue</StatusLabel>
                </div>
                <div className={p.buttons} aria-label="Button examples">
                  <button type="button" className={p.primaryButton}>Save notes</button>
                  <button type="button" className={p.ghostButton}>Ask Dana</button>
                  <button type="button" className={p.dangerButton}>Withdraw</button>
                  <button type="button" className={p.primaryButton} disabled>Send to vendors</button>
                </div>
              </div>
            </article>
          </div>
          <Note>Every change is dated and signed, so nothing about your case is ever a mystery.</Note>
        </section>

        <section id="margin-needs" className={s.section} aria-labelledby="margin-needs-title">
          <div className={s.sectionMain}>
            <h2 id="margin-needs-title" className={s.sectionTitle}>Tell us about your company</h2>
            <p className={s.sectionText}>About ten minutes. Save and come back anytime. Your advisor sees it only after you submit.</p>
            <div className={p.formSheet}>
              <NeedsForm
                ui={{
                  root: p.form, grid: p.formGrid, field: p.field, wide: p.wide, label: p.label, hint: p.hint, input: p.input,
                  select: p.input, checks: p.checks, check: p.check, checkbox: p.checkbox, error: p.error, summary: p.summary,
                  summaryTitle: p.summaryTitle, summaryList: p.summaryList, actions: p.formActions, primary: p.primaryButton,
                  secondary: p.ghostButton, success: p.inlineStatus, legend: p.label,
                }}
              />
            </div>
          </div>
          <Note>We never share your answers with a vendor without telling you first.</Note>
        </section>

        <section id="margin-faq" className={s.section} aria-labelledby="margin-faq-title">
          <div className={s.sectionMain}>
            <h2 id="margin-faq-title" className={s.sectionTitle}>Questions people ask us</h2>
            <FaqList
              ui={{ root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner }}
              icon={<svg viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>}
            />
          </div>
          <Note>Something else on your mind? Your advisor answers within one business day.</Note>
        </section>

        <section className={s.closing} aria-labelledby="margin-closing-title">
          <h2 id="margin-closing-title" className={s.closingTitle}>Let us take notes for you.</h2>
          <p className={s.closingText}>Start with your needs. We will bring the evidence, the questions to ask, and the paperwork.</p>
          <a className={s.closingCta} href="#margin-needs">Start your needs assessment</a>
          <p className={s.signature}>Dana Ortiz, advisor, on behalf of MatchMaker HR</p>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.brand}>MatchMaker <span className={s.brandHr}>HR</span></span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </div>
      </footer>
    </DesignRoot>
  );
}
