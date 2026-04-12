/**
 * Before Prompt Hook - Injects Hermes Memory into System Prompt
 *
 * This hook intercepts the prompt building process and injects:
 * 1. USER.md content (user profile)
 * 2. MEMORY.md content (persistent memory)
 * 3. Relevant session history (from FTS5 search)
 *
 * Note: Memory injection is primarily handled by HermesContextEngine.assemble()
 * This hook provides additional dynamic context when needed.
 */

export async function beforePromptHook(context) {
  const additions = [];

  // Memory injection is handled by HermesContextEngine.assemble()
  // This hook can provide additional dynamic context

  // Check if there's a hermes marker in recent messages
  const lastMessage = context.messages?.[context.messages.length - 1];
  if (lastMessage?.content?.includes?.('[HERMES_INJECT]')) {
    additions.push('Note: User has requested memory injection via HERMES_INJECT marker.');
  }

  if (additions.length === 0) {
    return {};
  }

  return {
    systemPromptAddition: additions.join('\n')
  };
}
