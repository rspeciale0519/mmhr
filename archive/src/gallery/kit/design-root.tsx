"use client";

import { useCallback, useState, type ReactNode, type RefObject } from "react";

import { PortalContainer } from "./portal";

type Props = {
  className: string;
  theme: "light" | "dark";
  children: ReactNode;
  /** Gives a design direct access to its root, for example to write CSS variables. */
  rootRef?: RefObject<HTMLDivElement | null>;
};

/** The outer element of a design. Portaled overlays mount inside it. */
export function DesignRoot({ className, theme, children, rootRef }: Props) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
    if (rootRef) rootRef.current = node;
  }, [rootRef]);
  return (
    <div ref={attach} className={className} data-theme={theme}>
      <PortalContainer.Provider value={element}>{children}</PortalContainer.Provider>
    </div>
  );
}
