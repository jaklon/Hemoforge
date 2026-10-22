import { lazy, Suspense, useEffect, useState } from "react"
import Landing from "./Landing"

const ResearchWorkspace = lazy(() => import("./ResearchWorkspace"))

// A workspace hash (#guard, #pilot, …) opens the workspace; an empty hash shows the landing page.
const inWorkspace = () => location.hash.length > 1

export default function App() {
  const [entered, setEntered] = useState(inWorkspace)

  useEffect(() => {
    const sync = () => setEntered(inWorkspace())
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])

  useEffect(() => {
    scrollTo(0, 0)
  }, [entered])

  if (!entered) return <Landing onEnter={() => (location.hash = "guard")} />

  return (
    <Suspense fallback={null}>
      <ResearchWorkspace />
    </Suspense>
  )
}
