"use client";

import clsx from "clsx";
import { useState } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { caseSummary, journey, principles } from "../../kit/data";
import { DesignRoot } from "../../kit/design-root";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { display } from "./fonts";
import { ShortlistHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#shortlist-how", "How it works"],
  ["#shortlist-scorecard", "Scorecard"],
  ["#shortlist-case", "Your case"],
  ["#shortlist-faq", "Questions"],
] as const;

function Mark() {
  return (
    <svg className={s.mark} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="7" width="16" height="20" rx="3" />
      <rect x="12" y="4" width="16" height="20" rx="3" />
    </svg>
  );
}

export default function ShortlistHome() {
  const { theme, toggle } = useDesignTheme("shortlist", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable)} theme={theme}>
      <a className={s.skip} href="#shortlist-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#shortlist-main" aria-label="MatchMaker HR home"><Mark />MatchMaker HR</a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.pill}>{theme === "dark" ? "Light" : "Dark"}</ThemeToggle>
            <a className={clsx(s.pill, s.desktopOnly)} href="#shortlist-main">Sign in</a>
            <a className={clsx(s.pill, s.pillStrong, s.desktopOnly)} href="#shortlist-needs">Get started</a>
            <MobileNav
              ui={{ trigger: clsx(s.pill, s.mobileOnly), overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody }}
              triggerLabel="Menu"
            >
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={clsx(s.pill, s.pillStrong)} href="#shortlist-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="shortlist-main" className={s.main}>
        <ShortlistHero state={scorecard} />

        <section className={s.promises} aria-label="How MMHR stays on your side">
          {principles.map((item, index) => (
            <div key={item.title} className={s.promise} data-tone={index}>
              <h2 className={s.promiseTitle}>{item.title}</h2>
              <p className={s.promiseText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="shortlist-how" className={s.section} aria-labelledby="shortlist-how-title">
          <h2 id="shortlist-how-title" className={s.sectionTitle}>From a long list to a signed contract</h2>
          <ol className={s.steps}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.step}>
                <span className={s.stepNumber} aria-hidden="true">{index + 1}</span>
                <h3 className={s.stepTitle}>{step.title}</h3>
                <p className={s.stepText}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="shortlist-scorecard" className={s.section} aria-labelledby="shortlist-scorecard-title">
          <h2 id="shortlist-scorecard-title" className={s.sectionTitle}>The full scorecard</h2>
          <p className={s.sectionText}>Your picks above carry over. Scores come only from approved evidence; unknown means not verified yet.</p>
          <Scorecard
            state={scorecard}
            pickLabel={(selected) => (selected ? "Added" : "Add")}
            renderScore={(score) => (
              <>
                <span className={p.segments} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((index) => <i key={index} data-on={index < score || undefined} />)}
                </span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={{
              root: p.board, head: p.boardHead, title: p.boardTitle, subtitle: p.boardText, toolbar: p.toolbar, count: p.count,
              countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb, scroller: p.scroller,
              table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit, pick: p.pick,
              evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle, evidenceText: p.popoverText,
              criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell, score: p.score,
              unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
            }}
          />
        </section>

        <section id="shortlist-case" className={s.section} aria-labelledby="shortlist-case-title">
          <h2 id="shortlist-case-title" className={s.sectionTitle}>Your case, at a glance</h2>
          <div className={p.caseGrid}>
            <article className={p.caseCard} aria-label="Sample case">
              <div className={p.caseTop}>
                <div>
                  <p className={p.caseCompany}>{caseSummary.company}</p>
                  <p className={p.caseGoal}>{caseSummary.employees} employees. {caseSummary.goal}.</p>
                </div>
                <CaseActionsMenu
                  ui={{ trigger: p.ghostButton, content: p.menu, item: p.menuItem, danger: p.menuDanger, separator: p.menuSeparator, label: p.menuLabel }}
                  onSelect={setMenuResult}
                />
              </div>
              <StageTrace ui={{ root: p.trace, item: p.traceItem, marker: p.traceMarker, label: p.traceLabel }} />
              <p className={p.inlineStatus} role="status" aria-live="polite">{menuResult}</p>
              <CaseActivity
                ui={{
                  root: p.tabs, list: p.tabList, trigger: p.tab, panel: p.tabPanel, rows: p.rows, row: p.row, rowTitle: p.rowTitle,
                  rowMeta: p.rowMeta, status: p.status, empty: p.empty, emptyTitle: p.emptyTitle, emptyText: p.emptyText,
                  emptyAction: p.ghostButton, skeleton: p.skeleton, skeletonLine: p.skeletonLine, reload: p.linkButton,
                }}
              />
            </article>
            <aside className={p.nextCard} aria-labelledby="shortlist-next-title">
              <p className={p.nextKicker}>Up next</p>
              <h3 id="shortlist-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
              <p className={p.nextMeta}>Due {caseSummary.due}. {caseSummary.advisor} is with you.</p>
              <ConfirmApproval
                ui={{
                  trigger: p.primaryButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
                  actions: p.dialogActions, cancel: p.ghostButton, confirm: p.primaryButton, result: p.inlineStatus,
                }}
              />
              <div className={p.labels} aria-label="Status examples">
                <StatusLabel tone="success" className={p.status}>On track</StatusLabel>
                <StatusLabel tone="info" className={p.status}>Waiting for you</StatusLabel>
                <StatusLabel tone="warning" className={p.status}>Due in 3 days</StatusLabel>
                <StatusLabel tone="danger" className={p.status}>Overdue</StatusLabel>
              </div>
              <div className={p.buttons} aria-label="Button examples">
                <button type="button" className={p.ghostButton}>Save draft</button>
                <button type="button" className={p.dangerButton}>Withdraw</button>
                <button type="button" className={p.primaryButton} disabled>Send to vendors</button>
              </div>
            </aside>
          </div>
        </section>

        <section id="shortlist-needs" className={s.section} aria-labelledby="shortlist-needs-title">
          <h2 id="shortlist-needs-title" className={s.sectionTitle}>Deal us in</h2>
          <p className={s.sectionText}>Tell us what you need. About ten minutes, saved as you go, and private until you submit.</p>
          <div className={p.formCard}>
            <NeedsForm
              ui={{
                root: p.form, grid: p.formGrid, field: p.field, wide: p.wide, label: p.label, hint: p.hint, input: p.input,
                select: p.input, checks: p.checks, check: p.check, checkbox: p.checkbox, error: p.error, summary: p.summary,
                summaryTitle: p.summaryTitle, summaryList: p.summaryList, actions: p.formActions, primary: p.primaryButton,
                secondary: p.ghostButton, success: p.inlineStatus, legend: p.label,
              }}
            />
          </div>
        </section>

        <section id="shortlist-faq" className={s.section} aria-labelledby="shortlist-faq-title">
          <h2 id="shortlist-faq-title" className={s.sectionTitle}>Good questions</h2>
          <FaqList
            ui={{ root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner }}
            icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>}
          />
        </section>

        <section className={s.closing} aria-labelledby="shortlist-closing-title">
          <h2 id="shortlist-closing-title" className={s.closingTitle}>Five great options. One easy decision.</h2>
          <a className={clsx(s.pill, s.pillStrong, s.closingCta)} href="#shortlist-needs">Start your needs assessment</a>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.brand}><Mark />MatchMaker HR</span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </div>
      </footer>
    </DesignRoot>
  );
}
