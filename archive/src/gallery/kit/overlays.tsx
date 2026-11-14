import clsx from "clsx";
import { Dialog, DropdownMenu } from "radix-ui";
import { useState, type ReactNode } from "react";

import base from "./kit.module.css";
import { usePortalContainer } from "./portal";

export type ConfirmUi = Partial<Record<"trigger" | "overlay" | "content" | "title" | "description" | "actions" | "cancel" | "confirm" | "result", string>>;

/** A consequential action asks first, then confirms with the same verb. */
export function ConfirmApproval({ ui }: { ui: ConfirmUi }) {
  const [approved, setApproved] = useState(false);
  const [open, setOpen] = useState(false);
  const container = usePortalContainer();
  return (
    <div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className={ui.trigger} disabled={approved}>{approved ? "RFP approved" : "Approve RFP"}</Dialog.Trigger>
        <Dialog.Portal container={container}>
          <Dialog.Overlay className={clsx(base.dialogOverlay, ui.overlay)} />
          <Dialog.Content className={clsx(base.dialogContent, ui.content)}>
            <Dialog.Title className={ui.title}>Approve this RFP?</Dialog.Title>
            <Dialog.Description className={ui.description}>
              MMHR sends version 3 to the four contenders you chose. Vendors can reply until October 29. You can still answer their questions after it goes out.
            </Dialog.Description>
            <div className={ui.actions}>
              <Dialog.Close className={ui.cancel}>Keep editing</Dialog.Close>
              <button type="button" className={ui.confirm} onClick={() => { setApproved(true); setOpen(false); }}>Approve RFP</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <p className={ui.result} role="status" aria-live="polite">{approved ? "RFP approved. Vendors receive it in their portal." : ""}</p>
    </div>
  );
}

export type MenuUi = Partial<Record<"trigger" | "content" | "item" | "danger" | "separator" | "label", string>>;

export function CaseActionsMenu({ ui, onSelect }: { ui: MenuUi; onSelect?: (action: string) => void }) {
  const choose = (action: string) => () => onSelect?.(action);
  const container = usePortalContainer();
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={ui.trigger}>Case actions</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content className={clsx(base.menuContent, ui.content)} align="end" sideOffset={8} collisionPadding={12}>
          <DropdownMenu.Label className={ui.label}>Fernwood Dental Group</DropdownMenu.Label>
          <DropdownMenu.Item className={ui.item} onSelect={choose("Owner changed to Sam Lee")}>Change owner</DropdownMenu.Item>
          <DropdownMenu.Item className={ui.item} onSelect={choose("Next action set for Monday")}>Set next action</DropdownMenu.Item>
          <DropdownMenu.Item className={ui.item} onSelect={choose("Customer message drafted")}>Draft a customer message</DropdownMenu.Item>
          <DropdownMenu.Separator className={ui.separator} />
          <DropdownMenu.Item className={clsx(ui.item, ui.danger)} onSelect={choose("Case paused")}>Pause case</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export type SheetUi = Partial<Record<"trigger" | "overlay" | "content" | "title" | "close" | "body", string>>;

/** Mobile navigation as a side sheet with focus trapping from Radix. */
export function MobileNav({ ui, triggerLabel, children }: { ui: SheetUi; triggerLabel: ReactNode; children: ReactNode }) {
  const container = usePortalContainer();
  return (
    <Dialog.Root>
      <Dialog.Trigger className={ui.trigger} aria-label="Open menu">{triggerLabel}</Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className={clsx(base.dialogOverlay, ui.overlay)} />
        <Dialog.Content className={clsx(base.sheetContent, ui.content)} aria-describedby={undefined}>
          <Dialog.Title className={ui.title}>Menu</Dialog.Title>
          <Dialog.Close className={ui.close} aria-label="Close menu">Close</Dialog.Close>
          <div className={ui.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Links inside the mobile sheet close it when followed. */
export const SheetLink = Dialog.Close;
