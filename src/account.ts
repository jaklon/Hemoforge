import { useSyncExternalStore } from "react"

// The signed-in account. The session is an HttpOnly cookie the browser sends with /api calls.
export interface Profile {
  username: string
  name: string
  email: string
  company: string
  role: string
}

export class AccountError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message)
  }
}

/** JSON call to the account API; throws AccountError with the server's message. */
export async function accountApi<T = void>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AccountError("Python API is offline. Start it, then retry.")
  }
  if (response.status === 204) return undefined as T
  const json = response.headers.get("content-type")?.includes("application/json")
  if (!json) throw new AccountError("Python API is offline. Start it, then retry.", response.status)
  const data = await response.json()
  if (!response.ok)
    throw new AccountError(typeof data.detail === "string" ? data.detail : "Request failed.", response.status)
  return data as T
}

// undefined = not checked yet, null = signed out.
let current: Profile | null | undefined
const listeners = new Set<() => void>()
function set(profile: Profile | null) {
  current = profile
  listeners.forEach((listener) => listener())
}

export function useAccount() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** The signed-in profile; only call inside the signed-in workspace. */
export const useProfile = () => useAccount()!

export async function loadAccount() {
  try {
    set(await accountApi<Profile>("auth/me"))
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) set(null)
    else throw error
  }
}

/** `beforeEnter` runs after the credentials check out but before the workspace replaces the sign-in page. */
export async function signIn(username: string, password: string, beforeEnter?: () => Promise<void>) {
  const profile = await accountApi<Profile>("auth/login", "POST", { username, password })
  await beforeEnter?.()
  set(profile)
}

export async function signOut() {
  try {
    await accountApi("auth/logout", "POST")
  } finally {
    set(null)
  }
}

export async function saveProfile(profile: Profile) {
  const saved = await accountApi<Profile>("account", "PUT", profile)
  set(saved)
  return saved
}

export const changePassword = (current: string, next: string) =>
  accountApi("account/password", "PUT", { current, next })

export const initials = (profile: Profile) =>
  (profile.name || profile.username)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
