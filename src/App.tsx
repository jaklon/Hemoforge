import { lazy, Suspense, useEffect, useState } from "react"
import Landing from "./Landing"
import WorkWithUs from "./WorkWithUs"

const ResearchWorkspace = lazy(() => import("./ResearchWorkspace"))

// #work-with-us shows the business page, any other hash (#guard, #pilot, …) opens the workspace,
// and an empty hash shows the landing page.
const page = () => (location.hash === "#work-with-us" ? "business" : location.hash.length > 1 ? "workspace" : "landing")

export default function App() {
  const [current, setCurrent] = useState(page)

  useEffect(() => {
    const sync = () => setCurrent(page())
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])

  useEffect(() => {
    scrollTo(0, 0)
  }, [current])

  const enter = () => (location.hash = "data")
  if (current === "landing") return <Landing onEnter={enter} />
  if (current === "business") return <WorkWithUs onEnter={enter} />

  return (
    <Suspense fallback={null}>
      <ResearchWorkspace />
    </Suspense>
  )
}
