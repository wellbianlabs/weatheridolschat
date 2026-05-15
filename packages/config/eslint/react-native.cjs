/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [require.resolve('./base.cjs'), 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  plugins: ['react-native'],
  settings: { react: { version: 'detect' } },
  env: { 'react-native/react-native': true },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
};
