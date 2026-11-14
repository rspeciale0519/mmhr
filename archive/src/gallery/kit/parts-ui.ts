import type { ActivityUi, FaqUi } from "./bits";
import type { NeedsFormUi } from "./needs-form";
import type { ConfirmUi, MenuUi, SheetUi } from "./overlays";
import type { ScorecardUi } from "./scorecard";
import type { StageTraceUi } from "./stage-trace";

/**
 * Maps a design's CSS module to kit slots by a shared naming convention, so a
 * design styles every part without repeating the wiring. A design can still
 * pass its own ui object to any kit component instead.
 */
type Classes = Readonly<Record<string, string>>;

export const scorecardUi = (p: Classes): ScorecardUi => ({
  root: p.card, head: p.head, title: p.title, subtitle: p.subtitle, toolbar: p.toolbar, count: p.count,
  countValue: p.countValue, reveal: p.reveal, switchRoot: p.switchRoot, switchThumb: p.switchThumb, scroller: p.scroller,
  table: p.table, corner: p.corner, vendorHead: p.vendorHead, vendorName: p.vendorName, fit: p.fit, pick: p.pick,
  evidenceTrigger: p.evidenceTrigger, evidencePanel: p.popover, evidenceTitle: p.popoverTitle, evidenceText: p.popoverText,
  criterion: p.criterion, criterionLabel: p.criterionLabel, weight: p.weight, cell: p.cell, score: p.score,
  scoreValue: p.scoreValue, unknown: p.unknown, priceRow: p.priceRow, priceCell: p.priceCell, message: p.message,
});

export const traceUi = (p: Classes): StageTraceUi => ({ root: p.trace, item: p.traceItem, marker: p.traceMarker, label: p.traceLabel });

export const activityUi = (p: Classes): ActivityUi => ({
  root: p.tabs, list: p.tabList, trigger: p.tab, panel: p.tabPanel, rows: p.rows, row: p.rowItem, rowTitle: p.rowTitle,
  rowMeta: p.rowMeta, status: p.status, empty: p.empty, emptyTitle: p.emptyTitle, emptyText: p.emptyText,
  emptyAction: p.outlineButton, skeleton: p.skeleton, skeletonLine: p.skeletonLine, reload: p.linkButton,
});

export const menuUi = (p: Classes): MenuUi => ({
  trigger: p.outlineButton, content: p.menu, item: p.menuItem, danger: p.menuDanger, separator: p.menuSeparator, label: p.menuLabel,
});

export const confirmUi = (p: Classes): ConfirmUi => ({
  trigger: p.primaryButton, overlay: p.overlay, content: p.dialog, title: p.dialogTitle, description: p.dialogText,
  actions: p.dialogActions, cancel: p.outlineButton, confirm: p.primaryButton, result: p.inlineStatus,
});

export const formUi = (p: Classes): NeedsFormUi => ({
  root: p.form, grid: p.formGrid, field: p.field, wide: p.wide, label: p.label, hint: p.hint, input: p.input,
  select: p.input, checks: p.checks, check: p.check, checkbox: p.checkbox, error: p.error, summary: p.summary,
  summaryTitle: p.summaryTitle, summaryList: p.summaryList, actions: p.formActions, primary: p.primaryButton,
  secondary: p.outlineButton, success: p.inlineStatus, legend: p.label,
});

export const faqUi = (p: Classes): FaqUi => ({
  root: p.faq, item: p.faqItem, header: p.faqHeader, trigger: p.faqTrigger, icon: p.faqIcon, content: p.faqContent, inner: p.faqInner,
});

export const sheetUi = (s: Classes, trigger: string): SheetUi => ({
  trigger, overlay: s.sheetOverlay, content: s.sheet, title: s.sheetTitle, close: s.sheetClose, body: s.sheetBody,
});

/** Joins two class maps key by key, so a design can extend shared page classes. */
export function mergeClasses(base: Classes, own: Classes): Record<string, string> {
  const keys = new Set([...Object.keys(base), ...Object.keys(own)]);
  return Object.fromEntries([...keys].map((key) => [key, [base[key], own[key]].filter(Boolean).join(" ")]));
}
