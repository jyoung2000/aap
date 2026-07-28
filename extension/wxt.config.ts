import { defineConfig } from 'wxt';

// JobPilot WebExtension — one codebase, Chrome (MV3) + Firefox builds.
// The manifest version is stamped from EXTENSION_VERSION (default 1.0.0) so the
// popup's "update available" nudge can compare against the container's reported version.
const EXTENSION_VERSION = process.env.EXTENSION_VERSION || '1.0.0';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Explicit imports everywhere (no auto-import magic) so `browser` always resolves
  // to webextension-polyfill and TypeScript stays predictable.
  imports: false,
  srcDir: '.',
  outDir: '.output',
  manifest: ({ browser }) => ({
    name: 'JobPilot',
    version: EXTENSION_VERSION,
    description:
      'JobPilot — your self-hosted job auto-apply co-pilot. Fills applications, handles knockout questions, and pauses for human input when needed.',
    permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'notifications', 'alarms'],
    optional_permissions: ['debugger'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'JobPilot',
    },
    // Firefox needs a stable add-on id for signing / temporary install.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'jobpilot@jobpilot.selfhosted',
              strict_min_version: '115.0',
            },
          },
        }
      : {}),
  }),
  zip: {
    // Deterministic archive names so the bundle script can find them reliably.
    artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip',
    sourcesTemplate: '{{name}}-{{version}}-sources.zip',
  },
});
