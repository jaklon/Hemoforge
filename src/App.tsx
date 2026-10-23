import { lazy, Suspense, useEffect, useState } from "react"
import Landing from "./Landing"
import WorkWithUs from "./WorkWithUs"
import { labSessionFromHash, liveModuleFromHash } from "./lab-session"

const ResearchWorkspace = lazy(() => import("./ResearchWorkspace"))
const VirtualLab = lazy(() => import("./VirtualLab"))
const LiveLabDashboard = lazy(() => import("./LiveLabDashboard"))

// #work-with-us shows the business page, any other hash (#guard, #pilot, …) opens the workspace,
// and an empty hash shows the landing page.
const page = () =>
  location.hash.startsWith("#lab")
    ? "lab"
    : /^#(?:guard|pilot|plan)\/live\//.test(location.hash)
      ? "live"
      : location.hash === "#work-with-us"
        ? "business"
        : location.hash.length > 1
          ? "workspace"
          : "landing"

export default function App() {
  const [current, setCurrent] = useState(page)
  const [hash, setHash] = useState(() => location.hash)

  useEffect(() => {
    const sync = () => {
      setHash(location.hash)
      setCurrent(page())
    }
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])

  useEffect(() => {
    scrollTo(0, 0)
  }, [current])

  const enter = () => (location.hash = "guard")
  if (current === "landing") return <Landing onEnter={enter} />
  if (current === "business") return <WorkWithUs onEnter={enter} />

  return (
    <Suspense fallback={null}>
      {current === "lab" ? (
        <VirtualLab />
      ) : current === "live" ? (
        <LiveLabDashboard
          key={labSessionFromHash(hash) ?? hash}
          module={liveModuleFromHash(hash)}
        />
      ) : (
        <ResearchWorkspace />
      )}
    </Suspense>
  )
}
