import { useEffect } from "react"

import katex from "katex"

import "katex/dist/katex.min.css"

import { PageTitle, Badge, Button } from "./workspace-ui"

import { methods, methodReferences } from "./methods-content"

import { downloadFile } from "./workspace-utils"

import { sourceReferences } from "./source-references"

function downloadLatex() {
  const symbols: Record<string, string> = {
    σ: String.raw`\ensuremath{\sigma}`,

    ξ: String.raw`\ensuremath{\xi}`,

    η: String.raw`\ensuremath{\eta}`,

    μ: String.raw`\ensuremath{\mu}`,

    Φ: String.raw`\ensuremath{\Phi}`,

    φ: String.raw`\ensuremath{\phi}`,

    ℓ: String.raw`\ensuremath{\ell}`,

    Δ: String.raw`\ensuremath{\Delta}`,

    ŷ: String.raw`\ensuremath{\widehat y}`,

    "≥": String.raw`\ensuremath{\ge}`,

    "≤": String.raw`\ensuremath{\le}`,

    "⋯": String.raw`\ensuremath{\cdots}`,

    "−": "-",

    "×": String.raw`\ensuremath{\times}`,

    ᵢ: String.raw`\textsubscript{i}`,

    ᵣ: String.raw`\textsubscript{r}`,

    "₀": String.raw`\textsubscript{0}`,

    "₁": String.raw`\textsubscript{1}`,

    ⱼ: String.raw`\textsubscript{j}`,

    "₋": String.raw`\textsubscript{-}`,

    ₖ: String.raw`\textsubscript{k}`,

    "²": String.raw`\textsuperscript{2}`,

    "√": String.raw`\ensuremath{\surd}`,

    "∑": String.raw`\ensuremath{\sum}`,

    "→": String.raw`\ensuremath{\to}`,

    "₂": String.raw`\textsubscript{2}`,
  }

  const escape = (value: string) =>
    [...value]

      .map(
        (character) =>
          symbols[character] ??
          (/[&%$#_{}]/.test(character) ? `\\${character}` : character),
      )

      .join("")

  const tex = [
    String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage[unicode]{hyperref}
\title{HemoGPT: Methods, Equations and References}
\author{HemoForge research workspace}
\date{}
\begin{document}
\maketitle
\tableofcontents`,

    ...methods.map((method) =>
      [
        `\\section{${escape(method.title)}}`,

        `${escape(method.module)}. Computation: ${escape(method.engine)}.`,

        escape(method.intro),

        escape(method.notation),

        ...method.equations.map(
          (equation) =>
            `\\subsection{${escape(equation.name)}}\n\\[${equation.latex}\\]\n${escape(equation.explanation)}`,
        ),

        `\\paragraph{Limits} ${escape(method.limits)}`,

        ...method.refs.map((id) => {
          const reference = methodReferences.find((item) => item.id === id)!

          return `\\paragraph{Reference} ${escape(reference.title)}. \\url{${reference.url}}`
        }),
      ].join("\n\n"),
    ),

    "\\section{Data provenance}",

    "Bundled fixtures are software test data. These source records are background references; their inclusion does not verify imported or bundled measurements.",

    ...sourceReferences.map(
      (source) =>
        `${escape(source.name)}. ${escape(source.details)} \\url{${source.url}}`,
    ),

    "\\end{document}",
  ].join("\n\n")

  downloadFile("hemogpt-methods.tex", tex, "application/x-tex")
}

export default function MethodsPage({ section }: { section: string }) {
  useEffect(() => {
    const target = document.getElementById(
      section ? `methods/${section}` : "page-title",
    )

    if (!target) return

    if (section) target.scrollIntoView({ block: "start" })

    target.focus({ preventScroll: true })
  }, [section])

  return (
    <div className="methods-page">
      <PageTitle
        title="Methods & references"
        description="The equations behind each result, their sources, and the limits of their interpretation."
        action={<Button onClick={downloadLatex}>Download LaTeX source</Button>}
      />
      <div className="methods-layout">
        <nav className="methods-toc" aria-label="Methods contents">
          <strong>In this notebook</strong>
          {methods.map((method) => (
            <a
              key={method.id}
              href={`#methods/${method.id}`}
              aria-current={section === method.id ? "location" : undefined}
            >
              {method.title}
              <small>{method.module}</small>
            </a>
          ))}
          <a href="#methods/references">Reference library</a>
          <a href="#methods/sources">Data provenance</a>
        </nav>
        <div className="methods-body">
          <p className="methods-intro">
            Equations match the current implementation. Each section states
            where its calculation runs. Mathematical references describe the
            method; biological validation requires separate evidence.
          </p>
          {methods.map((method) => (
            <section
              key={method.id}
              id={`methods/${method.id}`}
              className="method-section"
              tabIndex={-1}
            >
              <header>
                <div>
                  <span className="method-module">{method.module}</span>
                  <h2>{method.title}</h2>
                </div>
                <a href={`#${method.route}`}>
                  Open {method.module.split(" /")[0]} ↗
                </a>
              </header>
              <Badge>{method.engine}</Badge>
              <p>{method.intro}</p>
              <p className="method-notation">{method.notation}</p>
              {method.equations.map((equation) => (
                <figure
                  key={equation.id}
                  id={`methods/${equation.id}`}
                  tabIndex={-1}
                >
                  <figcaption>
                    <a href={`#methods/${equation.id}`}>
                      {equation.name} <span aria-hidden="true">#</span>
                    </a>
                  </figcaption>
                  <div
                    className="equation-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label={`Equation: ${equation.name}`}
                    dangerouslySetInnerHTML={{
                      __html: katex.renderToString(equation.latex, {
                        displayMode: true,

                        output: "htmlAndMathml",

                        throwOnError: true,

                        trust: false,

                        strict: "error",
                      }),
                    }}
                  />
                  <p>{equation.explanation}</p>
                </figure>
              ))}
              <div className="method-limits">
                <strong>Interpretation & limits</strong>
                <p>{method.limits}</p>
              </div>
              {method.refs.length > 0 && (
                <p className="method-citations">
                  References:{" "}
                  {method.refs.map((id) => {
                    const reference = methodReferences.find(
                      (item) => item.id === id,
                    )!

                    return (
                      <a key={id} href={`#methods/ref-${id}`}>
                        {reference.title}
                      </a>
                    )
                  })}
                </p>
              )}
            </section>
          ))}
          <section
            id="methods/references"
            className="method-section"
            tabIndex={-1}
          >
            <h2>Reference library</h2>
            {methodReferences.map((reference) => (
              <article
                id={`methods/ref-${reference.id}`}
                tabIndex={-1}
                key={reference.id}
                className="method-reference"
              >
                <a href={reference.url} target="_blank" rel="noreferrer">
                  {reference.title} ↗
                </a>
                <p>{reference.detail}</p>
              </article>
            ))}
          </section>
          <section
            id="methods/sources"
            className="method-section"
            tabIndex={-1}
          >
            <h2>Data provenance</h2>
            <p>
              The following records are background sources named in the project
              proposal. Bundled numbers remain software-test fixtures. Imported
              files carry their own names and hashes; a hash proves file
              identity, not source validation.
            </p>
            {sourceReferences.map((source) => (
              <article key={source.id} className="method-reference">
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name} · {source.id} ↗
                </a>
                <p>{source.details}</p>
                <p>
                  Used as background for: {source.module}. {source.license}.
                </p>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
