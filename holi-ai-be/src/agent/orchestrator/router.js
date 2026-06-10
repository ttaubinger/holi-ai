const extractPendingQuestionFromRouterMessages = (messages) => {
  const userMsg = messages.find(m => m.role === 'user' && m.content && m.content.includes('Current pending question to evaluate:'));
  if (!userMsg) return null;
  const match = userMsg.content.match(/Current pending question to evaluate:\s*(.*?)\n\nRetrieved facts/s);
  if (!match) return null;
  return match[1].trim();
};

const buildRouterFallbackResponse = (question) => ({
  headline: 'Additional Info Needed',
  diagnostic_summary: 'I need some details to continue.',
  chat_message: question
});

const handleRouterTurn = (msg, apiMessages) => {
  const hasSendResponse = msg.tool_calls && msg.tool_calls.some(tc => tc.function.name === 'send_response');
  const hasDequeue = msg.tool_calls && msg.tool_calls.some(tc => tc.function.name === 'dequeue_question');
  const hasEvaluate = msg.tool_calls && msg.tool_calls.some(tc => tc.function.name === 'evaluate_current_question');

  if (!hasSendResponse && !hasDequeue && !hasEvaluate) {
    const question = extractPendingQuestionFromRouterMessages(apiMessages);
    if (question) return buildRouterFallbackResponse(question);
  }
  return null;
};

const handleRouterFallback = (msg, apiMessages, context) => {
  if (context.isQueueRouter) {
    const fallback = handleRouterTurn(msg, apiMessages);
    if (fallback) return { isDone: true, response: fallback };
  }
  return null;
};

module.exports = { handleRouterTurn, handleRouterFallback };
