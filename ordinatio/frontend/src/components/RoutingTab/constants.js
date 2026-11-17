import { strings } from '../../constants/strings';

export const DEFAULT_COLOR_PALETTE = [
  '#38bdf8', // Sky
  '#c084fc', // Purple
  '#34d399', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6'  // Teal
];

export const INITIAL_FALLBACK_ROUTES = [];

export const LLM_PROVIDERS = [
  {
    id: 'openai',
    name: strings.routing.providers.openaiStd,
    badge: 'OpenAI / vLLM / NIM',
    desc: strings.routing.providers.openaiStdDesc,
    pathSuffix: '/v1/chat/completions',
    defaultDomain: 'http://127.0.0.1:8000',
    color: '#38bdf8',
    isCompatible: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    badge: strings.routing.providers.deepseek,
    desc: strings.routing.providers.deepseekDesc,
    pathSuffix: '/chat/completions',
    defaultDomain: 'https://api.deepseek.com',
    color: '#2dd4bf',
    isCompatible: true
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: strings.routing.providers.claude,
    desc: strings.routing.providers.claudeDesc,
    pathSuffix: '/v1/messages',
    defaultDomain: 'https://api.anthropic.com',
    color: '#fb923c',
    isCompatible: false
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: strings.routing.providers.gemini,
    desc: strings.routing.providers.geminiDesc,
    pathSuffix: '/v1beta/models/{model_id}:generateContent',
    defaultDomain: 'https://generativelanguage.googleapis.com',
    color: '#a78bfa',
    isCompatible: false
  },
  {
    id: 'cohere',
    name: 'Cohere Command',
    badge: strings.routing.providers.cohere,
    desc: strings.routing.providers.cohereDesc,
    pathSuffix: '/v2/chat',
    defaultDomain: 'https://api.cohere.com',
    color: '#f43f5e',
    isCompatible: false
  },
  {
    id: 'custom',
    name: strings.routing.providers.custom,
    badge: strings.routing.providers.customBadge,
    desc: strings.routing.providers.customDesc,
    pathSuffix: '',
    defaultDomain: '',
    color: '#94a3b8',
    isCompatible: true
  }
];

export const buildEndpointUrl = (domain, providerId, modelId = '') => {
  const cleanDomain = (domain || '').trim().replace(/\/+$/, '');
  if (!cleanDomain) return '';
  if (providerId === 'custom') return cleanDomain;
  const prov = LLM_PROVIDERS.find(p => p.id === providerId) || LLM_PROVIDERS[0];
  let suffix = prov.pathSuffix;
  if (suffix.includes('{model_id}')) {
    suffix = suffix.replace('{model_id}', modelId || '{model_id}');
  }
  if (cleanDomain.endsWith(suffix)) {
    return cleanDomain;
  }
  return `${cleanDomain}${suffix}`;
};

export const extractDomainAndProvider = (endpointUrl) => {
  if (!endpointUrl) return { domain: '', provider: 'openai' };
  const clean = endpointUrl.trim();
  for (const prov of LLM_PROVIDERS) {
    if (!prov.pathSuffix) continue;
    const baseSuffix = prov.pathSuffix.split('{model_id}')[0];
    if (clean.includes(baseSuffix)) {
      const parts = clean.split(baseSuffix);
      return { domain: parts[0], provider: prov.id };
    }
  }
  return { domain: clean, provider: 'custom' };
};

