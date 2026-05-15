module.exports = {
  root: true,
  extends: [require.resolve('@wi/config/eslint/base')],
  rules: {
    // packages/core must remain platform-neutral (no React, Next, RN, Expo).
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['react', 'react-dom', 'react-native', 'next', 'next/*', 'expo*'],
            message:
              'Platform-specific imports are not allowed in @wi/core. Move platform code to @wi/ui or apps/*.',
          },
        ],
      },
    ],
  },
};
