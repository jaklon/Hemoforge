import { lazy, Suspense, useEffect, useState } from "react"
import Landing from "./Landing"
import WorkWithUs from "./WorkWithUs"
import SignIn from "./SignIn"
import { loadAccount, useAccount } from "./account"
import { labSessionFromHash, liveModuleFromHash } from "./lab-session"
import { appPageFromHash } from "./app-routing"

const ResearchWorkspace = lazy(() => import("./ResearchWorkspace"))
const VirtualLab = lazy(() => import("./VirtualLab"))
const LiveLabDashboard = lazy(() => import("./LiveLabDashboard"))
const PocHub = lazy(() => import("./PocHub"))

// Account persistence belongs to the research workspace, not local-only PoC sessions.
function AuthenticatedWorkspace() {
  const account = useAccount()
  const [accountError, setAccountError] = useState("")
  const checkAccount = () => {
    setAccountError("")
    loadAccount().catch((error: Error) => setAccountError(error.message))
  }
  useEffect(checkAccount, [])
  if (account === undefined && !accountError) return null
  if (!account) return <SignIn key={accountError} error={accountError} onRetry={accountError ? checkAccount : undefined} />
  return <ResearchWorkspace />
}

export default function App() {
  const [hash, setHash] = useState(() => location.hash)
  const current = appPageFromHash(hash)
  useEffect(() => {
    const sync = () => setHash(location.hash)
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])
  useEffect(() => { scrollTo(0, 0) }, [current])
  const enter = () => (location.hash = "data")
  if (current === "landing") return <Landing onEnter={enter} />
  if (current === "business") return <WorkWithUs onEnter={enter} />
  return <Suspense fallback={null}>
    {current === "poc" ? <PocHub invalid={hash !== "#poc" && hash !== "#poc/"} />
      : current === "lab" ? <VirtualLab />
      : current === "live" ? <LiveLabDashboard key={labSessionFromHash(hash) ?? hash} module={liveModuleFromHash(hash)} />
      : <AuthenticatedWorkspace />}
  </Suspense>
}
