import clsx from "clsx";
import { Accordion, Tabs } from "radix-ui";
import { useState, type ReactNode } from "react";

import { faqs, responses } from "./data";
import base from "./kit.module.css";

export type Tone = "success" | "info" | "warning" | "danger" | "neutral";

/** Status always carries a word; designs color it through data-tone. */
export function StatusLabel({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <span className={className} data-tone={tone}>{children}</span>;
}

export type FaqUi = Partial<Record<"root" | "item" | "header" | "trigger" | "icon" | "content" | "inner", string>>;

export function FaqList({ ui, icon }: { ui: FaqUi; icon?: ReactNode }) {
  return (
    <Accordion.Root type="single" collapsible className={ui.root}>
      {faqs.map((faq) => (
        <Accordion.Item key={faq.q} value={faq.q} className={ui.item}>
          <Accordion.Header className={ui.header}>
            <Accordion.Trigger className={ui.trigger}>
              {faq.q}
              {icon && <span className={ui.icon} aria-hidden="true">{icon}</span>}
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className={ui.content}>
            <p className={ui.inner}>{faq.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

export type ActivityUi = Partial<Record<
  "root" | "list" | "trigger" | "panel" | "rows" | "row" | "rowTitle" | "rowMeta" | "status"
  | "empty" | "emptyTitle" | "emptyText" | "emptyAction" | "skeleton" | "skeletonLine" | "reload",
  string
>>;

/** Tabs that show a populated list, an empty state, and a loading state. */
export function CaseActivity({ ui }: { ui: ActivityUi }) {
  const [loading, setLoading] = useState(true);
  return (
    <Tabs.Root defaultValue="responses" className={ui.root}>
      <Tabs.List className={ui.list} aria-label="Case activity">
        <Tabs.Trigger className={ui.trigger} value="responses">Responses</Tabs.Trigger>
        <Tabs.Trigger className={ui.trigger} value="questions">Questions</Tabs.Trigger>
        <Tabs.Trigger className={ui.trigger} value="activity">Activity</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content className={ui.panel} value="responses">
        <ul className={ui.rows}>
          {responses.map((item) => (
            <li key={item.vendor} className={ui.row}>
              <span className={ui.rowTitle}>{item.vendor}</span>
              <StatusLabel tone={item.tone} className={ui.status}>{item.status}</StatusLabel>
              <span className={ui.rowMeta}>{item.updated}</span>
            </li>
          ))}
        </ul>
      </Tabs.Content>
      <Tabs.Content className={ui.panel} value="questions">
        <div className={ui.empty}>
          <p className={ui.emptyTitle}>No open questions</p>
          <p className={ui.emptyText}>When a vendor asks about your requirements, the question appears here for your advisor to answer.</p>
          <button type="button" className={ui.emptyAction}>Add a note for vendors</button>
        </div>
      </Tabs.Content>
      <Tabs.Content className={ui.panel} value="activity">
        {loading ? (
          <div className={ui.skeleton} aria-busy="true" aria-label="Loading activity">
            {[72, 88, 64].map((width) => (
              <span key={width} className={clsx(base.skeleton, ui.skeletonLine)} style={{ width: `${width}%` }} />
            ))}
            <button type="button" className={ui.reload} onClick={() => setLoading(false)}>Show loaded activity</button>
          </div>
        ) : (
          <ul className={ui.rows}>
            <li className={ui.row}><span className={ui.rowTitle}>Dana approved the comparison</span><span className={ui.rowMeta}>October 6</span></li>
            <li className={ui.row}><span className={ui.rowTitle}>You chose four contenders</span><span className={ui.rowMeta}>October 4</span></li>
            <li className={ui.row}><span className={ui.rowTitle}>Needs assessment submitted</span><span className={ui.rowMeta}>October 1</span></li>
          </ul>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}

export function ThemeToggle({ theme, onToggle, className, children }: { theme: "light" | "dark"; onToggle: () => void; className?: string; children?: ReactNode }) {
  return (
    <button type="button" className={className} onClick={onToggle} aria-pressed={theme === "dark"} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>
      {children ?? (theme === "dark" ? "Light" : "Dark")}
    </button>
  );
}
