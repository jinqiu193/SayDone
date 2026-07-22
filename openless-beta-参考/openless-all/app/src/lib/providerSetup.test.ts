import {
  areProvidersConfigured,
  shouldShowProviderSetupPrompt,
} from './providerSetup';

function assertEqual(actual: boolean, expected: boolean, name: string) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(
  areProvidersConfigured({
    activeAsrProvider: 'volcengine',
    activeLlmProvider: 'ark',
    asrConfigured: true,
    llmConfigured: true,
    volcengineConfigured: true,
    arkConfigured: true,
  }),
  true,
  'configured when ASR and LLM are both ready',
);

assertEqual(
  areProvidersConfigured({
    activeAsrProvider: 'volcengine',
    activeLlmProvider: 'ark',
    asrConfigured: false,
    llmConfigured: true,
    volcengineConfigured: false,
    arkConfigured: true,
  }),
  false,
  'not configured when ASR provider is missing',
);

assertEqual(
  areProvidersConfigured({
    activeAsrProvider: 'volcengine',
    activeLlmProvider: 'ark',
    asrConfigured: true,
    llmConfigured: false,
    volcengineConfigured: true,
    arkConfigured: false,
  }),
  false,
  'not configured when LLM provider is missing',
);

assertEqual(
  areProvidersConfigured({
    activeAsrProvider: 'whisper',
    activeLlmProvider: 'ark',
    asrConfigured: true,
    llmConfigured: true,
    volcengineConfigured: false,
    arkConfigured: true,
  }),
  true,
  'configured when active ASR is non-volcengine but already ready',
);

assertEqual(
  shouldShowProviderSetupPrompt(
    {
      activeAsrProvider: 'whisper',
      activeLlmProvider: 'ark',
      asrConfigured: false,
      llmConfigured: false,
      volcengineConfigured: false,
      arkConfigured: false,
    },
    null,
  ),
  true,
  'show first-run prompt when providers are missing and no prompt was seen',
);

assertEqual(
  shouldShowProviderSetupPrompt(
    {
      activeAsrProvider: 'whisper',
      activeLlmProvider: 'ark',
      asrConfigured: false,
      llmConfigured: false,
      volcengineConfigured: false,
      arkConfigured: false,
    },
    '1',
  ),
  false,
  'do not repeat first-run prompt after the user has deferred it in this session',
);

assertEqual(
  shouldShowProviderSetupPrompt(
    {
      activeAsrProvider: 'whisper',
      activeLlmProvider: 'ark',
      asrConfigured: true,
      llmConfigured: true,
      volcengineConfigured: false,
      arkConfigured: true,
    },
    null,
  ),
  false,
  'do not show prompt when providers are already configured',
);
