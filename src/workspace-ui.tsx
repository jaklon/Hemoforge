import { useId, useRef, type ReactNode } from "react"
import { signOut } from "./account"

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "any",
  optional = false,
  hint,
  disabled = false,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number | "any"
  optional?: boolean
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  const invalid =
    value !== null &&
    (!Number.isFinite(value) ||
      (min !== undefined && value < min) ||
      (max !== undefined && value > max) ||
      (step === 1 && !Number.isInteger(value)))
  return (
    <label className="number-field" htmlFor={id}>
      {label}
      <input
        id={id}
        type="number"
        value={value === null || !Number.isFinite(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={hint || invalid ? `${id}-hint` : undefined}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? optional
                ? null
                : NaN
              : Number(event.target.value),
          )
        }
      />
      {(hint || invalid) && (
        <small id={`${id}-hint`}>
          {invalid
            ? `Enter ${step === 1 ? "a whole number" : "a number"}${
                min !== undefined ? ` ≥ ${min}` : ""
              }${max !== undefined ? ` and ≤ ${max}` : ""}.`
            : hint}
        </small>
      )}
    </label>
  )
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    guard: (
      <>
        <path d="M12 3 4 6v6c0 4 3 7 8 9 5-2 8-5 8-9V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),

    pilot: <path d="M4 18V6m0 12h16M7 14l4-5 4 3 5-7" />,

    plan: (
      <path d="M9 3h6m-5 0v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" />
    ),

    dna: <path d="M7 3c0 6 10 12 10 18M17 3C17 9 7 15 7 21M8 7h8M8 17h8" />,

    data: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v12c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0" />
      </>
    ),

    report: <path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" />,

    dashboard: <path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" />,

    arrow: <path d="m9 5 7 7-7 7" />,

    pin: <path d="M8 3h8v6l3 4v2H5v-2l3-4zM12 15v6" />,

    download: <path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3" />,

    alert: <path d="M12 3 2 21h20zM12 9v5m0 3v1" />,

    check: <path d="m5 12 4 4L19 6" />,

    home: <path d="m3 11 9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5" />,

    logout: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,

    bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,

    team: (
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-6 9c0-3 3-5 6-5s6 2 6 5m1-9a3 3 0 1 0 0-6m2 15c0-2-1-4-3-5" />
    ),
  }

  return (
    <svg
      className="icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.data}
    </svg>
  )
}

export function Button({
  children,

  onClick,

  primary = false,

  disabled = false,

  icon,
  "aria-label": ariaLabel,
}: {
  children: ReactNode

  onClick?: () => void

  primary?: boolean

  disabled?: boolean

  icon?: string
  "aria-label"?: string
}) {
  return (
    <button
      type="button"
      className={`button${primary ? " primary" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

/** Sidebar sign-out link; asks for confirmation in a modal first. */
export function SignOutLink({ collapsed }: { collapsed: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  return (
    <>
      <a
        href="#"
        title={collapsed ? "Sign out" : undefined}
        onClick={(e) => {
          e.preventDefault()
          dialog.current?.showModal()
        }}
      >
        <Icon name="logout" />
        <strong>Sign out</strong>
      </a>
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby={titleId}
        // Clicks on the backdrop land on the dialog element itself.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <span className="confirm-dialog-icon">
          <Icon name="logout" />
        </span>
        <h2 id={titleId}>Sign out?</h2>
        <p>You'll return to the sign-in page.</p>
        <form method="dialog" className="confirm-dialog-actions">
          <button className="button" autoFocus>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              dialog.current?.close()
              // Any workspace route shows the sign-in page once signed out.
              location.hash = "data"
              void signOut()
            }}
          >
            Sign out
          </button>
        </form>
      </dialog>
    </>
  )
}

export function Badge({
  children,

  tone = "neutral",
}: {
  children: ReactNode

  tone?: "neutral" | "warning" | "success" | "brand"
}) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export function Panel({
  title,

  caption,

  action,

  children,

  className = "",
}: {
  title: string

  caption?: string

  action?: ReactNode

  children: ReactNode

  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {caption && <p>{caption}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

interface DetailsProps {
  title: string

  children: ReactNode
}

export function Details({ title, children }: DetailsProps) {
  return (
    <details className="details-panel">
      <summary>
        {title}
        <Icon name="arrow" />
      </summary>
      <div className="details-body">{children}</div>
    </details>
  )
}

export function PageTitle({
  title,

  description,

  action,
}: {
  title: string

  description: string

  action?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        <h1 id="page-title" tabIndex={-1}>
          {title}
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

const statusLabel: Record<string, string> = {
  normal: "Normal",

  warning: "Warning",

  needs_review: "Needs review",

  no_data: "No data",
}

export function Status({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "normal"
          ? "success"
          : status === "warning" || status === "needs_review"
            ? "warning"
            : "neutral"
      }
    >
      {statusLabel[status] ?? status}
    </Badge>
  )
}
