/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [require.resolve('./base.cjs'), 'next/core-web-vitals'],
  rules: {
    // Next/Tailwind project specific overrides go here.
  },
};
