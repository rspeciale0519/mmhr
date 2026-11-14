"use client";

import clsx from "clsx";
import { useState } from "react";

import { CaseActivity, FaqList, StatusLabel, ThemeToggle } from "../../kit/bits";
import { DesignRoot } from "../../kit/design-root";
import { caseSummary, journey, principles } from "../../kit/data";
import { NeedsForm } from "../../kit/needs-form";
import { CaseActionsMenu, ConfirmApproval, MobileNav, SheetLink } from "../../kit/overlays";
import { Scorecard } from "../../kit/scorecard";
import { StageTrace } from "../../kit/stage-trace";
import { useDesignTheme } from "../../kit/use-design-theme";
import { useScorecard } from "../../kit/use-scorecard";
import { body, display } from "./fonts";
import { OrbitHero } from "./hero";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#orbit-how", "How it works"],
  ["#orbit-scorecard", "Scorecard"],
  ["#orbit-case", "Platform"],
  ["#orbit-faq", "Questions"],
] as const;

function Logo() {
  return (
    <svg className={s.logo} viewBox="0 0 40 24" aria-hidden="true">
      <circle cx="13" cy="12" r="9" />
      <circle cx="27" cy="12" r="9" />
    </svg>
  );
}

export default function OrbitHome() {
  const { theme, toggle } = useDesignTheme("orbit", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#orbit-main">Skip to content</a>

      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#orbit-main" aria-label="MatchMaker HR home">
            <Logo />
            <span>MatchMaker HR</span>
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.iconButton}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {theme === "dark"
                  ? <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.42-1.42M4.92 19.08l1.42-1.42m0-11.32L4.92 4.92m14.16 14.16-1.42-1.42M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
                  : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
              </svg>
            </ThemeToggle>
            <a className={s.signIn} href="#orbit-main">Sign in</a>
            <a className={s.cta} href="#orbit-needs">Get started</a>
            <MobileNav
              ui={{ trigger: s.menuButton, overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody }}
              triggerLabel={<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
            >
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.cta} href="#orbit-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="orbit-main" className={s.main}>
        <OrbitHero />

        <section className={s.principles} aria-label="How MMHR stays on your side">
          {principles.map((item) => (
            <div key={item.title} className={s.principle}>
              <span className={s.principleMark} aria-hidden="true" />
              <h2 className={s.principleTitle}>{item.title}</h2>
              <p className={s.principleText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id="orbit-how" className={s.section} aria-labelledby="orbit-how-title">
          <div className={s.sectionHead}>
            <h2 id="orbit-how-title" className={s.sectionTitle}>Five steps from needs to signature</h2>
            <p className={s.sectionText}>Your advisor guides every step. You sign directly with the provider you choose.</p>
          </div>
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

        <section id="orbit-scorecard" className={s.section} aria-labelledby="orbit-scorecard-title">
          <div className={s.sectionHead}>
            <h2 id="orbit-scorecard-title" className={s.sectionTitle}>Compare every fit, side by side</h2>
            <p className={s.sectionText}>Scores come only from approved evidence. Unknown means not yet verified, not missing.</p>
          </div>
          <Scorecard
            state={scorecard}
            ui={{
              root: p.card, head: p.cardHead, title: p.cardTitle, subtitle: p.cardText, toolbar: p.toolbar, count: p.count,
              countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb, scroller: p.scroller,
              table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit, pick: p.pick,
              evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle, evidenceText: p.popoverText,
              criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell, score: p.score,
              scoreValue: p.scoreValue, unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
            }}
          />
        </section>

        <section id="orbit-case" className={s.section} aria-labelledby="orbit-case-title">
          <div className={s.sectionHead}>
            <h2 id="orbit-case-title" className={s.sectionTitle}>Always know what happens next</h2>
            <p className={s.sectionText}>Customers, vendors, and your advisor work from the same case. This is a sample.</p>
          </div>
          <div className={p.caseGrid}>
            <article className={p.casePanel} aria-label="Sample case">
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

            <aside className={p.nextPanel} aria-labelledby="orbit-next-title">
              <p className={p.nextEyebrow}>Next action</p>
              <h3 id="orbit-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
              <dl className={p.facts}>
                <div><dt>Owner</dt><dd>You, with {caseSummary.advisor}</dd></div>
                <div><dt>Due</dt><dd>{caseSummary.due}</dd></div>
              </dl>
              <ConfirmApproval
                ui={{
                  trigger: p.primaryButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
                  actions: p.dialogActions, cancel: p.secondaryButton, confirm: p.primaryButton, result: p.inlineStatus,
                }}
              />
              <div className={p.labels} aria-label="Status examples">
                <StatusLabel tone="success" className={p.status}>On track</StatusLabel>
                <StatusLabel tone="info" className={p.status}>Waiting for you</StatusLabel>
                <StatusLabel tone="warning" className={p.status}>Due in 3 days</StatusLabel>
                <StatusLabel tone="danger" className={p.status}>Overdue</StatusLabel>
              </div>
              <div className={p.buttons} aria-label="Button examples">
                <button type="button" className={p.secondaryButton}>Save draft</button>
                <button type="button" className={p.ghostButton}>Ask {caseSummary.advisor.split(" ")[0]}</button>
                <button type="button" className={p.dangerButton}>Withdraw</button>
                <button type="button" className={p.primaryButton} disabled>Send to vendors</button>
              </div>
            </aside>
          </div>
        </section>

        <section id="orbit-needs" className={p.needs} aria-labelledby="orbit-needs-title">
          <div className={p.needsIntro}>
            <h2 id="orbit-needs-title" className={s.sectionTitle}>Start with what you need</h2>
            <p className={s.sectionText}>
              It takes about ten minutes. Save as you go, and change anything later. Your advisor sees it only after you submit.
            </p>
          </div>
          <div className={p.formPanel}>
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

        <section id="orbit-faq" className={s.section} aria-labelledby="orbit-faq-title">
          <div className={s.sectionHead}>
            <h2 id="orbit-faq-title" className={s.sectionTitle}>Questions, answered</h2>
          </div>
          <FaqList
            ui={{ root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner }}
            icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>}
          />
        </section>

        <section className={s.closing} aria-labelledby="orbit-closing-title">
          <h2 id="orbit-closing-title" className={s.closingTitle}>See your best fit in one afternoon.</h2>
          <a className={s.closingCta} href="#orbit-needs">Start your needs assessment</a>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <span className={s.brand}><Logo /><span>MatchMaker HR</span></span>
          <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
        </div>
      </footer>
    </DesignRoot>
  );
}
