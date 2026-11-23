// Provider-agnostic AI adapter.
// No model provider is connected in this build; stored ai_enabled flags are
// never honored as true so nothing in the workspace silently calls an external model.

export function getAiAdapter() {
  return Object.freeze({
    enabled: false,
    provider: 'none',
    async complete() {
      throw new Error('No AI provider is enabled.');
    },
  });
}
