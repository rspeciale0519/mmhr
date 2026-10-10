"use client";

import clsx from "clsx";
import { useMemo, useState, type CSSProperties } from "react";

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
import { initialWeights, rankVendors, weightedFit, type Weights } from "../../kit/weighted-fit";
import { Device } from "./device";
import { body, display } from "./fonts";
import s from "./home.module.css";
import p from "./parts.module.css";

const nav = [
  ["#console-scorecard", "Scorecard"],
  ["#console-steps", "How it works"],
  ["#console-case", "Your case"],
  ["#console-faq", "Questions"],
] as const;

export default function ConsoleHome() {
  const { theme, toggle } = useDesignTheme("console", "light");
  const scorecard = useScorecard();
  const [menuResult, setMenuResult] = useState("");
  const [weights, setWeights] = useState<Weights>(initialWeights);
  const fit = useMemo(() => weightedFit(weights), [weights]);
  const order = useMemo(() => rankVendors(fit), [fit]);
  const nameOf = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return scorecard.revealed ? vendor.name : vendor.masked;
  };

  return (
    <DesignRoot className={clsx(s.root, display.variable, body.variable)} theme={theme}>
      <a className={s.skip} href="#console-main">Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href="#console-main" aria-label="MatchMaker HR home">
            <span className={s.brandDial} aria-hidden="true" />
            matchmaker hr
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggle} className={s.keyButton} />
            <a className={clsx(s.keyButton, s.desktopOnly)} href="#console-main">Sign in</a>
            <a className={clsx(s.orangeButton, s.desktopOnly)} href="#console-needs">Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.keyButton, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href="#console-needs">Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id="console-main" className={s.main}>
        <section className={s.hero} aria-labelledby="console-hero-title">
          <div className={s.heroCopy}>
            <h1 id="console-hero-title" className={s.heroTitle}>Turn up what matters. Watch the right platform rise.</h1>
            <p className={s.heroLede}>
              Set how much each requirement matters to your company. MatchMaker HR re-ranks every approved platform
              against your settings, using verified evidence only. Names stay masked until you meet your advisor, and
              you never pay.
            </p>
            <div className={s.heroActions}>
              <a className={s.orangeButton} href="#console-needs">Start your needs assessment</a>
              <a className={s.keyButton} href="#console-scorecard">Read the full scorecard</a>
            </div>
            <p className={s.heroNote}>
              Try it: drag a knob, tap it, or focus it and use the arrow keys. Keys a to f choose contenders.
            </p>
          </div>
          <div className={s.heroDevice}>
            <Device
              weights={weights}
              onWeight={(id, value) => setWeights((current) => ({ ...current, [id]: value }))}
              onReset={() => setWeights(initialWeights())}
              order={order}
              fit={fit}
              selected={scorecard.selected}
              onToggle={scorecard.toggle}
              nameOf={nameOf}
              count={scorecard.count}
              max={scorecard.max}
            />
            <p className={s.deviceNote}>Sample data for Fernwood Dental Group. Unknown evidence counts as zero until MMHR verifies it.</p>
          </div>
        </section>

        <section className={s.spec} aria-labelledby="console-spec-title">
          <h2 id="console-spec-title" className={s.specTitle}>Specifications</h2>
          <dl className={s.specList}>
            {principles.map((item) => (
              <div key={item.title} className={s.specRow}>
                <dt>{item.title}</dt>
                <dd>{item.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="console-scorecard" className={s.section} aria-labelledby="console-scorecard-title">
          <div className={s.sectionHead}>
            <h2 id="console-scorecard-title" className={s.sectionTitle}>The full readout.</h2>
            <p className={s.sectionText}>
              Columns follow your knob settings, best fit first. Every score links to the evidence behind it.
            </p>
          </div>
          <Scorecard
            state={scorecard}
            title="Scorecard"
            subtitle="Scores from 0 to 5. Unknown means MMHR has not verified it yet."
            order={order}
            fitFor={(id) => fit[id] ?? 0}
            renderScore={(score) => (
              <>
                <span className={p.segments} aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((step) => <i key={step} data-on={step <= score || undefined} />)}
                </span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            ui={scorecardUi(p)}
          />
        </section>

        <section id="console-steps" className={s.section} aria-labelledby="console-steps-title">
          <div className={s.sectionHead}>
            <h2 id="console-steps-title" className={s.sectionTitle}>Operating instructions.</h2>
            <p className={s.sectionText}>Five steps from your first answer to a signed contract. Your advisor runs each one with you.</p>
          </div>
          <ol className={s.manual}>
            {journey.map((step, index) => (
              <li key={step.title} className={s.manualStep} style={{ "--i": index } as CSSProperties}>
                <span className={s.manualNumber} aria-hidden="true">{index + 1}</span>
                <div>
                  <h3 className={s.manualTitle}>{step.title}</h3>
                  <p className={s.manualText}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="console-case" className={s.section} aria-labelledby="console-case-title">
          <div className={s.sectionHead}>
            <h2 id="console-case-title" className={s.sectionTitle}>Your case, on one panel.</h2>
            <p className={s.sectionText}>After you sign in, every stage, reply, and next action sits in one place.</p>
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
            <aside className={p.next} aria-labelledby="console-next-title">
              <p className={p.nextLabel}><span className={p.nextLed} aria-hidden="true" />Waiting for you</p>
              <h3 id="console-next-title" className={p.nextTitle}>{caseSummary.nextAction}</h3>
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

        <section id="console-needs" className={s.section} aria-labelledby="console-needs-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="console-needs-title" className={s.sectionTitle}>Input your needs.</h2>
              <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
            </div>
            <div className={p.formPanel}><NeedsForm ui={formUi(p)} /></div>
          </div>
        </section>

        <section id="console-faq" className={s.section} aria-labelledby="console-faq-title">
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id="console-faq-title" className={s.sectionTitle}>Questions.</h2>
            </div>
            <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
          </div>
        </section>
      </main>

      <section className={s.closing} aria-labelledby="console-closing-title">
        <h2 id="console-closing-title" className={s.closingTitle}>Your requirements, precisely matched.</h2>
        <a className={s.orangeButton} href="#console-needs">Start your needs assessment</a>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}><span className={s.brandDial} aria-hidden="true" />matchmaker hr</span>
        <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
