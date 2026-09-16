/** Release builds bundle all game assets and never include a server API key. */
module.exports = ({ config }) => {
  const allowLan = process.env.HOUSEWIRE_ALLOW_LAN === '1';
  const production = process.env.EAS_BUILD_PROFILE === 'production';

  if (production) {
    for (const [name, protocol] of [
      ['EXPO_PUBLIC_HOUSEWIRE_RELAY_URL', 'wss:'],
      ['EXPO_PUBLIC_HOUSEWIRE_FORGE_URL', 'https:'],
    ]) {
      let endpoint;
      try {
        endpoint = new URL(process.env[name] || '');
      } catch {
        throw new Error(`Set ${name} to your deployed secure server before a store build.`);
      }
      if (endpoint.protocol !== protocol || endpoint.username || endpoint.password) {
        throw new Error(`${name} must use ${protocol}// and must not contain credentials.`);
      }
    }
    if (allowLan) throw new Error('Store builds must not enable HOUSEWIRE_ALLOW_LAN.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      ['expo-build-properties', { android: { usesCleartextTraffic: allowLan } }],
    ],
  };
};
