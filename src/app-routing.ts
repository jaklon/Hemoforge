import { pocRouteFromHash } from "./lab-session.ts"

export function appPageFromHash(hash: string) {
  const poc = pocRouteFromHash(hash)
  if (poc)
    return poc.kind === "monitor" ? "live" : poc.kind === "lab" ? "lab" : "poc"
  return hash === "#work-with-us"
    ? "business"
    : hash.length > 1
      ? "workspace"
      : "landing"
}
