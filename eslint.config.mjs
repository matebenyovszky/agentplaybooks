/**
 * Flat config, loaded natively.
 *
 * `eslint-config-next` 16 ships flat configs — `core-web-vitals` and
 * `typescript` each export a `Linter.Config[]`. Reaching them through
 * `FlatCompat`, as this file used to, asks the legacy eslintrc bridge to
 * normalize a config that is already flat, and its validator then walks a
 * structure that references itself:
 *
 *   TypeError: Converting circular structure to JSON
 *       at ConfigValidator.formatErrors (@eslint/eslintrc/lib/shared/config-validator.js)
 *       --- property 'react' closes the circle
 *
 * That crash is what made the `eslint-config-next` 16 bump look unmergeable on
 * its own. Spreading the arrays directly removes the bridge, and with it the
 * `@eslint/eslintrc` dependency.
 */

import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Rules `eslint-plugin-react-hooks` 7 brought in with the Next 16 upgrade that
 * fire on existing code. They arrived as 21 findings; 8 have since been fixed
 * (#68, #72) and 11 remain — `npx eslint --format json .` is the live list, so
 * this comment does not go stale.
 *
 * They are real findings, not noise, but each is a question about what a
 * particular effect is *for*. What remains is almost entirely data-loading
 * effects, already written correctly for the pattern they use; changing those
 * means moving data loading to Suspense or server components, which is an
 * architecture decision rather than a lint cleanup. That is why they are
 * warnings — visible in every run rather than switched off — and why the count
 * is not expected to reach zero.
 *
 * Do not add rules here to quiet a new finding: a new one is a finding in new
 * code, which is exactly when it is cheapest to answer.
 *
 * The severity is rewritten where the shared config defines the rule, instead
 * of in an override object: flat config resolves a rule against the plugins
 * declared in the *same* object, so an override would have to redeclare
 * `react-hooks` — which ESLint then rejects as a redefined plugin.
 */
const PENDING_REACT_HOOKS_RULES = new Set([
  "react-hooks/set-state-in-effect",
  "react-hooks/immutability",
]);

function warnPendingRules(configs) {
  return configs.map((config) => {
    if (!config.rules) return config;
    const rules = Object.fromEntries(
      Object.entries(config.rules).map(([rule, setting]) => [
        rule,
        PENDING_REACT_HOOKS_RULES.has(rule) ? "warn" : setting,
      ]),
    );
    return { ...config, rules };
  });
}

const eslintConfig = [
  {
    ignores: [
      ".cloudflare/**",
      ".cloudflare-pages/**",
      ".next/**",
      ".open-next/**",
      ".tmp/**",
      ".wrangler/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...warnPendingRules(coreWebVitals),
  ...warnPendingRules(nextTypescript),
];

export default eslintConfig;
