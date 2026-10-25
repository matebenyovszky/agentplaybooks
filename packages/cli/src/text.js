/** Remove a trailing run in one pass, without regex backtracking on long input. */
export function trimEndCharacters(value, characters) {
  let end = value.length;
  while (end > 0 && characters.includes(value[end - 1])) end--;
  return value.slice(0, end);
}
