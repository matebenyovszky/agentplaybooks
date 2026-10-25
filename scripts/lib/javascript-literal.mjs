/** JSON literals also remain safe if generated code is embedded in HTML. */
export function javascriptLiteral(value) {
  return JSON.stringify(value).replace(/[<>\u2028\u2029]/g, character => ({
    "<": "\\u003c", ">": "\\u003e", "\u2028": "\\u2028", "\u2029": "\\u2029",
  })[character]);
}
