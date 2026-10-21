import { notFound } from "next/navigation";

import { isLaunchAreaEnabled, type LaunchArea } from "./launch-surface";

/** Second layer behind the proxy: a hidden area renders the not-found page. */
export function requireLaunchArea(area: LaunchArea): void {
  if (!isLaunchAreaEnabled(area)) notFound();
}
