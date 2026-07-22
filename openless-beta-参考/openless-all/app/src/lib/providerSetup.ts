import type { CredentialsStatus } from './types';

export const PROVIDER_SETUP_PROMPT_DEFERRED_KEY = 'ol.providerSetupPromptDeferredThisSession';

export function areProvidersConfigured(credentials: CredentialsStatus): boolean {
  const asrConfigured = credentials.asrConfigured ?? credentials.volcengineConfigured;
  const llmConfigured = credentials.llmConfigured ?? credentials.arkConfigured;
  return asrConfigured && llmConfigured;
}

export function shouldShowProviderSetupPrompt(
  credentials: CredentialsStatus,
  promptDeferredValue: string | null,
): boolean {
  return !areProvidersConfigured(credentials) && promptDeferredValue !== '1';
}
