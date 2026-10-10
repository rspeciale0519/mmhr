import { useState } from "react";

import { CaseActivity, StatusLabel } from "./bits";
import { caseSummary } from "./data";
import { CaseActionsMenu, ConfirmApproval } from "./overlays";
import { activityUi, confirmUi, menuUi, traceUi } from "./parts-ui";
import { StageTrace } from "./stage-trace";

type Classes = Readonly<Record<string, string>>;

/**
 * The signed-in case view every design shows: progress, activity tabs, the
 * actions menu, and the next action with its approval dialog. Classes follow
 * the parts-ui naming convention.
 */
export function CaseBoard({ p, id, nextLabel = "Waiting for you" }: { p: Classes; id: string; nextLabel?: string }) {
  const [menuResult, setMenuResult] = useState("");
  return (
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
      <aside className={p.next} aria-labelledby={`${id}-next-title`}>
        <p className={p.nextLabel}>{nextLabel}</p>
        <h3 id={`${id}-next-title`} className={p.nextTitle}>{caseSummary.nextAction}</h3>
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
  );
}
