import { expect, it } from "vitest";
import { javascriptLiteral } from "../scripts/lib/javascript-literal.mjs";

it("round-trips hostile route names without executable or HTML delimiters", () => {
  for (const value of ['../app/</script><script>alert("x")</script>', '"\\\n\r\u2028\u2029', ["[id]", "</script>"]]) {
    const literal = javascriptLiteral(value);
    expect(literal).not.toMatch(/[<>\u2028\u2029]/);
    expect(JSON.parse(literal)).toEqual(value);
  }
});
