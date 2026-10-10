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
import { body, display } from "./fonts";
import { AtelierHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#atelier-engagement", "The engagement"],
  ["#atelier-scorecard", "Assessment"],
  ["#atelier-case", "Your case"],
  ["#atelier-faq", "Questions"],
] as const;

const numerals = ["I", "II", "III", "IV", "V"];

export default function AtelierHome() {
  const { theme, toggle } = useDesignTheme("atelier", "dark");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#atelier-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#atelier-main" aria-label="MatchMaker HR home">
            <span className={s.brandMark} aria-hidden="true">MM</span>
            <span>MatchMaker HR</span>
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.quiet}>{theme === "dark" ? "Porcelain" : "Oxblood"}</ThemeToggle>
            <a className={clsx(s.quiet, s.desktopOnly)} href="#atelier-main">Client sign in</a>
            <MobileNav
              ui={{ trigger: clsx(s.quiet, s.mobileOnly), overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody }}
              triggerLabel="Menu"
            >
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#atelier-needs">Begin your needs assessment</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="atelier-main" className={s.main}>
        <AtelierHero />

        <section className={s.terms} aria-label="The terms of our counsel">
          {principles.map((item) => (
            <div key={item.title} className={s.term}>
              <span className={s.diamond} aria-hidden="true" />
              <h2 className={s.termTitle}>{item.title}</h2>
              <p className={s.termText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="atelier-engagement" className={s.section} aria-labelledby="atelier-engagement-title">
          <h2 id="atelier-engagement-title" className={s.sectionTitle}>The engagement</h2>
          <p className={s.sectionText}>Five considered steps, at the pace your company prefers.</p>
          <ol className={s.timeline}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.moment}>
                <span className={s.numeral} aria-hidden="true">{numerals[index]}</span>
                <div className={s.momentBody}>
                  <h3 className={s.momentTitle}>{step.title}</h3>
                  <p className={s.momentText}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="atelier-scorecard" className={s.section} aria-labelledby="atelier-scorecard-title">
          <h2 id="atelier-scorecard-title" className={s.sectionTitle}>A comparative assessment</h2>
          <p className={s.sectionText}>Prepared from approved evidence only. Names are withheld until we have spoken.</p>
          <Scorecard
            state={scorecard}
            title="Fernwood Dental Group"
            subtitle="Initial assessment of six platforms. Choose up to five to receive your request for proposal."
            pickLabel={(selected) => (selected ? "Selected" : "Select")}
            renderScore={(score) => (
              <>
                <span className={p.diamonds} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((index) => <i key={index} data-on={index < score || undefined} />)}
                </span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={{
              root: p.statement, head: p.statementHead, title: p.statementTitle, subtitle: p.statementText, toolbar: p.toolbar,
              count: p.count, countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb,
              scroller: p.scroller, table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit,
              pick: p.pick, evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle,
              evidenceText: p.popoverText, criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell,
              score: p.score, unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
            }}
          />
        </section>

        <section id="atelier-case" className={s.section} aria-labelledby="atelier-case-title">
          <h2 id="atelier-case-title" className={s.sectionTitle}>Your engagement, in view</h2>
          <p className={s.sectionText}>A sample of what you, your advisor, and invited vendors each see.</p>
          <div className={p.caseGrid}>
            <article className={p.panel} aria-label="Sample case">
              <div className={p.panelTop}>
                <div>
                  <p className={p.company}>{caseSummary.company}</p>
                  <p className={p.goal}>{caseSummary.employees} employees. {caseSummary.goal}.</p>
                </div>
                <CaseActionsMenu
                  ui={{ trigger: p.quietButton, content: p.menu, item: p.menuItem, danger: p.menuDanger, separator: p.menuSeparator, label: p.menuLabel }}
                  onSelect={setMenuResult}
                />
              </div>
              <StageTrace ui={{ root: p.trace, item: p.traceItem, marker: p.traceMarker, label: p.traceLabel }} />
              <p className={p.inlineStatus} role="status" aria-live="polite">{menuResult}</p>
              <CaseActivity
                ui={{
                  root: p.tabs, list: p.tabList, trigger: p.tab, panel: p.tabPanel, rows: p.rows, row: p.row, rowTitle: p.rowTitle,
                  rowMeta: p.rowMeta, status: p.status, empty: p.empty, emptyTitle: p.emptyTitle, emptyText: p.emptyText,
                  emptyAction: p.quietButton, skeleton: p.skeleton, skeletonLine: p.skeletonLine, reload: p.linkButton,
                }}
              />
            </article>
            <aside className={p.nextPanel} aria-labelledby="atelier-next-title">
              <p className={p.nextKicker}>Awaiting your decision</p>
              <h3 id="atelier-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
              <p className={p.nextMeta}>Requested by {caseSummary.advisor} for {caseSummary.due}.</p>
              <ConfirmApproval
                ui={{
                  trigger: p.brassButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
                  actions: p.dialogActions, cancel: p.quietButton, confirm: p.brassButton, result: p.inlineStatus,
                }}
              />
              <div className={p.labels} aria-label="Status examples">
                <StatusLabel tone="success" className={p.status}>On track</StatusLabel>
                <StatusLabel tone="info" className={p.status}>Awaiting you</StatusLabel>
                <StatusLabel tone="warning" className={p.status}>Due in 3 days</StatusLabel>
                <StatusLabel tone="danger" className={p.status}>Overdue</StatusLabel>
              </div>
              <div className={p.buttons} aria-label="Button examples">
                <button type="button" className={p.quietButton}>Save draft</button>
                <button type="button" className={p.dangerButton}>Withdraw</button>
                <button type="button" className={p.brassButton} disabled>Send to vendors</button>
              </div>
            </aside>
          </div>
        </section>

        <section id="atelier-needs" className={s.section} aria-labelledby="atelier-needs-title">
          <h2 id="atelier-needs-title" className={s.sectionTitle}>Begin your brief</h2>
          <p className={s.sectionText}>A few details let your advisor prepare. Everything stays private until you submit.</p>
          <div className={p.formPanel}>
            <NeedsForm
              submitLabel="Save my brief"
              ui={{
                root: p.form, grid: p.formGrid, field: p.field, wide: p.wide, label: p.label, hint: p.hint, input: p.input,
                select: p.input, checks: p.checks, check: p.check, checkbox: p.checkbox, error: p.error, summary: p.summary,
                summaryTitle: p.summaryTitle, summaryList: p.summaryList, actions: p.formActions, primary: p.brassButton,
                secondary: p.quietButton, success: p.inlineStatus, legend: p.label,
              }}
            />
          </div>
        </section>

        <section id="atelier-faq" className={s.section} aria-labelledby="atelier-faq-title">
          <h2 id="atelier-faq-title" className={s.sectionTitle}>Questions, answered with care</h2>
          <FaqList
            ui={{ root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner }}
            icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>}
          />
        </section>

        <section className={s.closing} aria-labelledby="atelier-closing-title">
          <span className={s.diamond} aria-hidden="true" />
          <h2 id="atelier-closing-title" className={s.closingTitle}>Counsel by referral, at no cost to you.</h2>
          <a className={s.closingCta} href="#atelier-needs">Begin your needs assessment</a>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.brand}><span className={s.brandMark} aria-hidden="true">MM</span><span>MatchMaker HR</span></span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </div>
      </footer>
    </DesignRoot>
  );
}
