import type { AiSite } from '../types/ai';
import { loadAiSites } from '../core/storage';

export const AI_IFRAME_RULE_ID = 1001;

export function extractEnabledAiDomains(sites: AiSite[]): string[] {
  const domains = new Set<string>();
  for (const site of sites) {
    if (!site.enabled) continue;
    try {
      const host = new URL(site.url).hostname.toLowerCase();
      if (host) domains.add(host);
    } catch {
      // Ignore invalid URL
    }
  }
  return [...domains];
}

export function buildAiFrameRule(
  domains: string[],
): chrome.declarativeNetRequest.Rule {
  return {
    id: AI_IFRAME_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      responseHeaders: [
        {
          header: 'x-frame-options',
          operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
        },
        {
          header: 'content-security-policy',
          operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
        },
        {
          header: 'frame-options',
          operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation,
        },
      ],
    },
    condition: {
      // TAB_ID_NONE (-1) + enabled AI requestDomains restricts header removal
      // strictly to the user's enabled AI hosts inside non-tab extension contexts
      // (Side Panel), leaving all normal tabs and all other websites untouched.
      tabIds: [-1],
      requestDomains: domains,
      resourceTypes: ['sub_frame' as chrome.declarativeNetRequest.ResourceType],
    },
  };
}

export async function setupAiFrameRules(sites?: AiSite[]): Promise<void> {
  if (
    typeof chrome === 'undefined' ||
    !chrome.declarativeNetRequest?.updateSessionRules
  ) {
    return;
  }

  try {
    const targetSites = sites ?? (await loadAiSites());
    const domains = extractEnabledAiDomains(targetSites);

    // tabIds condition is only supported in session-scoped DNR rules in Chrome MV3.
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [AI_IFRAME_RULE_ID],
      addRules: domains.length > 0 ? [buildAiFrameRule(domains)] : [],
    });
  } catch {
    // Ignore rule registration errors in restricted environments
  }
}
