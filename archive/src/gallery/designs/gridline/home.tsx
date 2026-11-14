"use client";

import clsx from "clsx";
import { useState, type CSSProperties, type ReactNode } from "react";

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
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#gridline-scorecard", "Scorecard"],
  ["#gridline-method", "Method"],
  ["#gridline-case", "Your case"],
  ["#gridline-faq", "Questions"],
] as const;

function Row({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  const titleId = `${id ?? label.toLowerCase().replace(/\s+/g, "-")}-title`;
  return (
    <section id={id} className={s.row} aria-labelledby={titleId}>
      <h2 id={titleId} className={s.rowLabel}>{label}</h2>
      <div className={s.rowBody}>{children}</div>
    </section>
  );
}

export default function GridlineHome() {
  const { theme, toggle } = useDesignTheme("gridline", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable)} theme={theme}>
      <a className={s.skip} href="#gridline-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#gridline-main" aria-label="MatchMaker HR home">
            <span className={s.brandBlock}>MMHR</span>
            <span className={s.brandName}>MatchMaker HR</span>
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.headerLink}>{theme === "dark" ? "Light" : "Dark"}</ThemeToggle>
            <a className={clsx(s.headerLink, s.desktopOnly)} href="#gridline-main">Sign in</a>
            <a className={clsx(s.headerCta, s.desktopOnly)} href="#gridline-needs">Get started</a>
            <MobileNav
              ui={{ trigger: clsx(s.headerLink, s.mobileOnly), overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody }}
              triggerLabel="Menu"
            >
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#gridline-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="gridline-main" className={s.main}>
        <section className={s.hero} aria-labelledby="gridline-hero-title">
          <h1 id="gridline-hero-title" className={s.heroTitle}>
            <span>Evidence first.</span>
            <span>Names later.</span>
            <span>No fee to you.</span>
          </h1>
          <div className={s.counter} aria-live="off">
            <p className={s.counterFigure}>
              <span key={scorecard.count} className={s.counterValue}>{scorecard.count}</span>
              <span className={s.counterMax}>/{scorecard.max}</span>
            </p>
            <p className={s.counterLabel}>Contenders chosen. Choose up to five in the scorecard below.</p>
          </div>
          <p className={s.heroLede}>
            MatchMaker HR scores every approved HR platform against your requirements. Vendor names stay hidden until you
            review your needs with an advisor. Providers pay us a referral fee; it never affects a score.
          </p>
        </section>

        <div id="gridline-scorecard" className={s.scoreBlock}>
          <Scorecard
            state={scorecard}
            title="Scorecard"
            subtitle="Fernwood Dental Group. Sample data. Scores from 0 to 5; unknown means not yet verified."
            renderScore={(score) => (
              <>
                <span className={p.bar} aria-hidden="true"><i style={{ "--w": score / 5 } as CSSProperties} /></span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={{
              root: p.card, head: p.head, title: p.title, subtitle: p.subtitle, toolbar: p.toolbar, count: p.count,
              countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb, scroller: p.scroller,
              table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit, pick: p.pick,
              evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle, evidenceText: p.popoverText,
              criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell, score: p.score,
              unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
            }}
          />
        </div>

        <Row label="Principles">
          <div className={s.principles}>
            {principles.map((item) => (
              <div key={item.title} className={s.principle}>
                <h3 className={s.principleTitle}>{item.title}</h3>
                <p className={s.principleText}>{item.body}</p>
              </div>
            ))}
          </div>
        </Row>

        <Row id="gridline-method" label="Method">
          <ol className={s.method}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.methodStep}>
                <span className={s.methodNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3 className={s.methodTitle}>{step.title}</h3>
                <p className={s.methodText}>{step.body}</p>
              </li>
            ))}
          </ol>
        </Row>

        <Row id="gridline-case" label="Your case">
          <div className={p.caseGrid}>
            <article className={p.panel} aria-label="Sample case">
              <div className={p.panelTop}>
                <div>
                  <p className={p.company}>{caseSummary.company}</p>
                  <p className={p.goal}>{caseSummary.employees} employees. {caseSummary.goal}.</p>
                </div>
                <CaseActionsMenu
                  ui={{ trigger: p.outlineButton, content: p.menu, item: p.menuItem, danger: p.menuDanger, separator: p.menuSeparator, label: p.menuLabel }}
                  onSelect={setMenuResult}
                />
              </div>
              <StageTrace ui={{ root: p.trace, item: p.traceItem, marker: p.traceMarker, label: p.traceLabel }} />
              <p className={p.inlineStatus} role="status" aria-live="polite">{menuResult}</p>
              <CaseActivity
                ui={{
                  root: p.tabs, list: p.tabList, trigger: p.tab, panel: p.tabPanel, rows: p.rows, row: p.rowItem, rowTitle: p.rowTitle,
                  rowMeta: p.rowMeta, status: p.status, empty: p.empty, emptyTitle: p.emptyTitle, emptyText: p.emptyText,
                  emptyAction: p.outlineButton, skeleton: p.skeleton, skeletonLine: p.skeletonLine, reload: p.linkButton,
                }}
              />
            </article>
            <aside className={p.next} aria-labelledby="gridline-next-title">
              <p className={p.nextLabel}>Next action</p>
              <h3 id="gridline-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
              <dl className={p.facts}>
                <div><dt>Owner</dt><dd>You, {caseSummary.advisor}</dd></div>
                <div><dt>Due</dt><dd>{caseSummary.due}</dd></div>
              </dl>
              <ConfirmApproval
                ui={{
                  trigger: p.primaryButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
                  actions: p.dialogActions, cancel: p.outlineButton, confirm: p.primaryButton, result: p.inlineStatus,
                }}
              />
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
        </Row>

        <Row id="gridline-needs" label="Your needs">
          <p className={s.bodyText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
          <NeedsForm
            ui={{
              root: p.form, grid: p.formGrid, field: p.field, wide: p.wide, label: p.label, hint: p.hint, input: p.input,
              select: p.input, checks: p.checks, check: p.check, checkbox: p.checkbox, error: p.error, summary: p.summary,
              summaryTitle: p.summaryTitle, summaryList: p.summaryList, actions: p.formActions, primary: p.primaryButton,
              secondary: p.outlineButton, success: p.inlineStatus, legend: p.label,
            }}
          />
        </Row>

        <Row id="gridline-faq" label="Questions">
          <FaqList
            ui={{ root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner }}
            icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>}
          />
        </Row>
      </main>

      <section className={s.closing} aria-labelledby="gridline-closing-title">
        <div className={s.closingInner}>
          <h2 id="gridline-closing-title" className={s.closingTitle}>Start with your needs.</h2>
          <a className={s.closingCta} href="#gridline-needs">Start your needs assessment</a>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.brand}><span className={s.brandBlock}>MMHR</span><span className={s.brandName}>MatchMaker HR</span></span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </div>
      </footer>
    </DesignRoot>
  );
}
