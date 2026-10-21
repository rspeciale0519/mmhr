import clsx from "clsx";
import { Popover, Switch } from "radix-ui";
import type { CSSProperties, ReactNode } from "react";

import { criteria, vendors, type Score, type Vendor } from "./data";
import base from "./kit.module.css";
import { usePortalContainer } from "./portal";
import type { ScorecardState } from "./use-scorecard";

export type ScorecardSlot =
  | "root" | "head" | "title" | "subtitle" | "toolbar" | "count" | "countValue" | "reveal" | "switchRoot" | "switchThumb"
  | "scroller" | "table" | "corner" | "vendorHead" | "vendorName" | "fit" | "pick" | "evidenceTrigger" | "evidencePanel"
  | "evidenceTitle" | "evidenceText" | "criterion" | "criterionLabel" | "weight" | "cell" | "score" | "scoreValue"
  | "unknown" | "priceRow" | "priceCell" | "message" | "legend";

export type ScorecardUi = Partial<Record<ScorecardSlot, string>>;

type Props = {
  state: ScorecardState;
  ui: ScorecardUi;
  title?: string;
  subtitle?: string;
  /** Lets a design draw its own score mark. CSS receives --score from 0 to 1. */
  renderScore?: (score: Exclude<Score, null>) => ReactNode;
  pickLabel?: (selected: boolean) => string;
  /** Column order by vendor id. Defaults to the sample order. */
  order?: readonly string[];
  /** Replaces the sample fit, for designs that let people weight requirements. */
  fitFor?: (id: string) => number;
  /** Lets a design animate or style the vendor name. Accessible names stay plain text. */
  renderName?: (label: string, vendor: Vendor, revealed: boolean) => ReactNode;
};

export function Scorecard({ state, ui, title = "Sample comparison", subtitle, renderScore, pickLabel, order, fitFor, renderName }: Props) {
  const name = (id: string) => {
    const vendor = vendors.find((item) => item.id === id)!;
    return state.revealed ? vendor.name : vendor.masked;
  };
  const pickText = pickLabel ?? ((selected: boolean) => (selected ? "Chosen" : "Choose"));
  const container = usePortalContainer();
  const columns = order
    ? order.map((id) => vendors.find((vendor) => vendor.id === id)).filter((vendor): vendor is Vendor => Boolean(vendor))
    : vendors;

  return (
    <section className={ui.root} aria-labelledby="scorecard-title">
      <div className={ui.head}>
        <div>
          <h3 id="scorecard-title" className={ui.title}>{title}</h3>
          <p className={ui.subtitle}>
            {subtitle ?? "Names stay hidden until your advisor reviews your requirements with you. Choose up to five contenders for the RFP."}
          </p>
        </div>
        <div className={ui.toolbar}>
          <p className={ui.count}>
            <span className={ui.countValue}>{state.count}</span> of {state.max} contenders chosen
          </p>
          <label className={ui.reveal}>
            <Switch.Root className={ui.switchRoot} checked={state.revealed} onCheckedChange={state.setRevealed}>
              <Switch.Thumb className={ui.switchThumb} />
            </Switch.Root>
            Preview disclosed names
          </label>
        </div>
      </div>

      <div className={clsx(base.scroller, ui.scroller)} role="region" aria-label="Scorecard, scrolls sideways" tabIndex={0}>
        <table className={clsx(base.table, ui.table)}>
          <caption className={base.srOnly}>
            Scores from 0 to 5 for each criterion. Unknown means MMHR has no verified evidence yet.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={clsx(base.stickyCell, ui.corner)}>Criteria</th>
              {columns.map((vendor) => {
                const selected = state.isSelected(vendor.id);
                return (
                  <th key={vendor.id} scope="col" className={ui.vendorHead} data-selected={selected || undefined}>
                    <span className={ui.vendorName}>
                      {renderName ? renderName(name(vendor.id), vendor, state.revealed) : name(vendor.id)}
                    </span>
                    <span className={ui.fit}>{fitFor ? fitFor(vendor.id) : vendor.fit}% fit</span>
                    <button
                      type="button"
                      className={ui.pick}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Remove" : "Choose"} ${name(vendor.id)} ${selected ? "from" : "as a"} contender`}
                      onClick={() => state.toggle(vendor.id)}
                    >
                      {pickText(selected)}
                    </button>
                    <Popover.Root>
                      <Popover.Trigger className={ui.evidenceTrigger} aria-label={`Evidence for ${name(vendor.id)}`}>
                        Evidence
                      </Popover.Trigger>
                      <Popover.Portal container={container}>
                        <Popover.Content className={ui.evidencePanel} sideOffset={8} collisionPadding={12}>
                          <p className={ui.evidenceTitle}>{name(vendor.id)}</p>
                          <p className={ui.evidenceText}>{vendor.evidence}</p>
                          <p className={ui.evidenceText}>{vendor.verified}</p>
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => (
              <tr key={criterion.id}>
                <th scope="row" className={clsx(base.stickyCell, ui.criterion)}>
                  <span className={ui.criterionLabel}>{criterion.label}</span>
                  <span className={ui.weight}>{criterion.weight}</span>
                </th>
                {columns.map((vendor) => {
                  const score = criterion.scores[vendor.id] ?? null;
                  return (
                    <td
                      key={vendor.id}
                      className={ui.cell}
                      data-selected={state.isSelected(vendor.id) || undefined}
                      data-score={score ?? "unknown"}
                    >
                      {score === null ? (
                        <span className={ui.unknown} title="No verified evidence yet">Unknown</span>
                      ) : (
                        <span className={ui.score} style={{ "--score": score / 5 } as CSSProperties}>
                          {renderScore ? renderScore(score) : <span className={ui.scoreValue}>{score}</span>}
                          <span className={base.srOnly}> out of 5</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={ui.priceRow}>
              <th scope="row" className={clsx(base.stickyCell, ui.criterion)}>
                <span className={ui.criterionLabel}>Price</span>
                <span className={ui.weight}>Compared, never ranked by fee</span>
              </th>
              {columns.map((vendor) => (
                <td key={vendor.id} className={ui.priceCell} data-selected={state.isSelected(vendor.id) || undefined}>
                  {vendor.price}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className={ui.message} role="status" aria-live="polite">{state.message}</p>
    </section>
  );
}
