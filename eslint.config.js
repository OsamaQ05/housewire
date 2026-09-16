// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/**', 'dist-*/**', 'tmp/**', 'downloads/**', 'android/**', 'ios/**'] },
  {
    rules: {
      // Housewire's sensor and LAN coordinators intentionally keep mutable,
      // non-rendering state in refs. React Compiler is disabled in app.json,
      // so its opt-in purity diagnostics do not apply to this codebase.
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
