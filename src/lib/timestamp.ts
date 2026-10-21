/**
 * The one rule for every timestamp the API accepts: ISO 8601 with a timezone.
 *
 * A time without a zone is read in whatever zone the database or the runtime
 * happens to use, so the same input can mean instants hours apart. For an
 * expiry that is the difference between a credential that still works and one
 * that has stopped, which is why it is refused rather than guessed. The value
 * returned is normalized to UTC, so stored times compare the way the calendar
 * does.
 */
export function isoTimestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${field} must be an ISO 8601 timestamp with a timezone`);
  }
  const date = value.slice(0, 10);
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error(`${field} contains an invalid calendar date`);
  }
  return new Date(value).toISOString();
}
