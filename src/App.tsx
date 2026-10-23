import { lazy, Suspense, useEffect, useState } from "react"
import Landing from "./Landing"
import WorkWithUs from "./WorkWithUs"
import { labSessionFromHash, liveModuleFromHash } from "./lab-session"
import { appPageFromHash } from "./app-routing"

const ResearchWorkspace = lazy(() => import("./ResearchWorkspace"))
const VirtualLab = lazy(() => import("./VirtualLab"))
const LiveLabDashboard = lazy(() => import("./LiveLabDashboard"))
const PocHub = lazy(() => import("./PocHub"))

// PoC routes have a dedicated shell; normal module hashes retain the research workspace.
export default function App() {
  const [hash, setHash] = useState(() => location.hash)
  const current = appPageFromHash(hash)

  useEffect(() => {
    const sync = () => {
      setHash(location.hash)
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
      {current === "poc" ? (
        <PocHub invalid={hash !== "#poc" && hash !== "#poc/"} />
      ) : current === "lab" ? (
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
