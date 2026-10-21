"use client";

import { createContext, useContext } from "react";

/**
 * Radix portals mount inside the design root instead of document.body, so
 * dialogs, menus, and popovers inherit that design's tokens and theme.
 */
export const PortalContainer = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainer) ?? undefined;
}
