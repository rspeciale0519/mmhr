import clsx from "clsx";
import type { CSSProperties, ComponentProps, ReactNode, RefObject } from "react";

import { FaqList, ThemeToggle } from "./bits";
import { CaseBoard } from "./case-board";
import { journey, principles } from "./data";
import { DesignRoot } from "./design-root";
import { NeedsForm } from "./needs-form";
import { MobileNav, SheetLink } from "./overlays";
import { faqUi, formUi, scorecardUi, sheetUi } from "./parts-ui";
import { Scorecard } from "./scorecard";
import type { DesignTheme } from "./use-design-theme";
import type { ScorecardState } from "./use-scorecard";

type Classes = Readonly<Record<string, string>>;

export type SoftCopy = {
  scorecardTitle: string;
  scorecardText: string;
  stepsTitle: string;
  stepsText: string;
  caseTitle: string;
  needsTitle: string;
  faqTitle: string;
  closingTitle: string;
};

type Props = {
  slug: string;
  /** Page layout classes from the design's home module. */
  s: Classes;
  /** Part classes that follow the parts-ui naming convention. */
  p: Classes;
  className: string;
  theme: DesignTheme;
  onToggleTheme: () => void;
  rootRef?: RefObject<HTMLDivElement | null>;
  brandMark: ReactNode;
  hero: ReactNode;
  scorecard: ScorecardState;
  scorecardProps?: Omit<ComponentProps<typeof Scorecard>, "state" | "ui">;
  copy: SoftCopy;
  /** Replaces the default step list with a design's own treatment. */
  steps?: ReactNode;
};

/**
 * The page frame for designs that share the parts-ui class names: header,
 * mobile menu, promises, scorecard, steps, case, needs form, FAQ, closing, and
 * footer. Each design supplies its hero, its classes, and its own tokens.
 */
export function SoftHome({ slug, s, p, className, theme, onToggleTheme, rootRef, brandMark, hero, scorecard, scorecardProps, copy, steps }: Props) {
  const id = (name: string) => `${slug}-${name}`;
  const nav = [
    [`#${id("scorecard")}`, "Scorecard"],
    [`#${id("steps")}`, "How it works"],
    [`#${id("case")}`, "Your case"],
    [`#${id("faq")}`, "Questions"],
  ] as const;

  return (
    <DesignRoot className={className} theme={theme} rootRef={rootRef}>
      <a className={s.skip} href={`#${id("main")}`}>Skip to content</a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <a className={s.brand} href={`#${id("main")}`} aria-label="MatchMaker HR home">
            {brandMark}
            MatchMaker HR
          </a>
          <nav className={s.nav} aria-label="Main">
            {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className={s.headerActions}>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} className={s.quiet} />
            <a className={clsx(s.quiet, s.desktopOnly)} href={`#${id("main")}`}>Sign in</a>
            <a className={clsx(s.solid, s.desktopOnly)} href={`#${id("needs")}`}>Get started</a>
            <MobileNav ui={sheetUi(s, clsx(s.quiet, s.mobileOnly))} triggerLabel="Menu">
              {nav.map(([href, label]) => (
                <SheetLink key={href} asChild><a className={s.sheetLink} href={href}>{label}</a></SheetLink>
              ))}
              <SheetLink asChild><a className={s.sheetLink} href={`#${id("needs")}`}>Get started</a></SheetLink>
            </MobileNav>
          </div>
        </div>
      </header>

      <main id={id("main")} className={s.main}>
        {hero}

        <section className={s.promises} aria-label="Our promises">
          {principles.map((item, index) => (
            <div key={item.title} className={s.promise} style={{ "--i": index } as CSSProperties}>
              <h2 className={s.promiseTitle}>{item.title}</h2>
              <p className={s.promiseText}>{item.body}</p>
            </div>
          ))}
        </section>

        <section id={id("scorecard")} className={s.section} aria-labelledby={id("scorecard-title")}>
          <div className={s.sectionHead}>
            <h2 id={id("scorecard-title")} className={s.sectionTitle}>{copy.scorecardTitle}</h2>
            <p className={s.sectionText}>{copy.scorecardText}</p>
          </div>
          <Scorecard
            state={scorecard}
            title="Sample scorecard"
            subtitle="Fernwood Dental Group. Scores from 0 to 5. Unknown means MMHR has not verified it yet."
            renderScore={(score) => (
              <>
                <span className={p.meter} aria-hidden="true"><i /></span>
                <span className={p.scoreValue}>{score}</span>
              </>
            )}
            {...scorecardProps}
            ui={scorecardUi(p)}
          />
        </section>

        <section id={id("steps")} className={s.section} aria-labelledby={id("steps-title")}>
          <div className={s.sectionHead}>
            <h2 id={id("steps-title")} className={s.sectionTitle}>{copy.stepsTitle}</h2>
            <p className={s.sectionText}>{copy.stepsText}</p>
          </div>
          {steps ?? (
            <ol className={s.steps}>
              {journey.map((step, index) => (
                <li key={step.title} className={s.step} style={{ "--i": index } as CSSProperties}>
                  <span className={s.stepNumber} aria-hidden="true">{index + 1}</span>
                  <h3 className={s.stepTitle}>{step.title}</h3>
                  <p className={s.stepText}>{step.body}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id={id("case")} className={s.section} aria-labelledby={id("case-title")}>
          <div className={s.sectionHead}>
            <h2 id={id("case-title")} className={s.sectionTitle}>{copy.caseTitle}</h2>
            <p className={s.sectionText}>After you sign in: the stage, each reply, and the one thing that needs you next.</p>
          </div>
          <CaseBoard p={p} id={slug} />
        </section>

        <section id={id("needs")} className={s.section} aria-labelledby={id("needs-title")}>
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id={id("needs-title")} className={s.sectionTitle}>{copy.needsTitle}</h2>
              <p className={s.sectionText}>About ten minutes. Saved as you go. Your advisor sees it only after you submit.</p>
            </div>
            <div className={p.formPanel}><NeedsForm ui={formUi(p)} /></div>
          </div>
        </section>

        <section id={id("faq")} className={s.section} aria-labelledby={id("faq-title")}>
          <div className={s.split}>
            <div className={s.sectionHead}>
              <h2 id={id("faq-title")} className={s.sectionTitle}>{copy.faqTitle}</h2>
            </div>
            <FaqList ui={faqUi(p)} icon={<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg>} />
          </div>
        </section>
      </main>

      <section className={s.closing} aria-labelledby={id("closing-title")}>
        <h2 id={id("closing-title")} className={s.closingTitle}>{copy.closingTitle}</h2>
        <p className={s.closingText}>Free for your company. Vendors pay a referral fee that never touches a score.</p>
        <a className={s.solid} href={`#${id("needs")}`}>Start your needs assessment</a>
      </section>

      <footer className={s.footer}>
        <span className={s.brand}>{brandMark}MatchMaker HR</span>
        <p>Sample design for review. All companies, people, and vendors shown are fictional.</p>
      </footer>
    </DesignRoot>
  );
}
