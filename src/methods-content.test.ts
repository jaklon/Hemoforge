import test from "node:test"
import assert from "node:assert/strict"
import katex from "katex"
import { methods, methodReferences } from "./methods-content.ts"

test("every published equation renders as accessible math and has a unique deep-link target", () => {
  const targets = new Set<string>()
  for (const method of methods) {
    assert.ok(!targets.has(method.id))
    targets.add(method.id)
    for (const equation of method.equations) {
      assert.ok(!targets.has(equation.id))
      targets.add(equation.id)
      const html = katex.renderToString(equation.latex, {
        displayMode: true,
        output: "htmlAndMathml",
        strict: "error",
        trust: false,
      })
      assert.match(html, /<math /)
      assert.doesNotMatch(html, /katex-error/)
    }
    for (const id of method.refs)
      assert.ok(methodReferences.some((reference) => reference.id === id))
  }
  assert.equal(methods.length, 7)
})
