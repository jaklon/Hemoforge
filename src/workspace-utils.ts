export function downloadFile(
  name: string,
  content: string | Blob,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }))

  const link = document.createElement("a")

  link.href = url

  link.download = name

  link.click()

  setTimeout(() => URL.revokeObjectURL(url), 1000)

  // The workspace provider listens for this and shows a notification.

  window.dispatchEvent(new CustomEvent("workspace-download", { detail: name }))
}

export function csv(rows: (string | number | null)[][]) {
  return rows

    .map((row) =>
      row

        .map((value) => {
          const safe =
            typeof value === "string" && /^[=+\-@\t\r]/.test(value)
              ? `'${value}`
              : String(value ?? "")

          return `"${safe.replace(/"/g, '""')}"`
        })

        .join(","),
    )

    .join("\r\n")
}

export function escapeHtml(value: string) {
  return value

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#39;")
}
