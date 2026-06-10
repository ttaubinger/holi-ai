const { getAgentTools, KNOWN_TOOLS } = require('./tools');

describe('tools evaluation', () => {
  it('should resolve all known tools correctly', () => {
    const activeStep = { tools: { allow: Array.from(KNOWN_TOOLS) } };
    const tools = getAgentTools(activeStep, {}, 'en');
    expect(tools.length).toBe(KNOWN_TOOLS.size);
    tools.forEach(t => {
      expect(t.type).toBe('function');
      expect(t.function.name).toBeDefined();
    });
  });
});

describe('tools dynamic rules', () => {
  it('evaluates dynamic allow rules correctly', () => {
    const activeStep = { tools: { allow: ['send_response'], dynamic_allow: [{ if: 'true', add: ['upsert_user_facts'] }] } };
    const tools = getAgentTools(activeStep, {}, 'en');
    const names = tools.map(t => t.function.name);
    expect(names).toContain('send_response');
    expect(names).toContain('upsert_user_facts');
  });
});

describe('tools errors', () => {
  it('throws error for unknown tool', () => {
    const activeStep = { tools: { allow: ['unknown_tool'] } };
    expect(() => getAgentTools(activeStep, {}, 'en')).toThrow(/Tool not found/);
  });
});

describe('tools empty rules', () => {
  it('returns empty array if no tools allowed', () => {
    expect(getAgentTools(null, {}, 'en')).toEqual([]);
    expect(getAgentTools({}, {}, 'en')).toEqual([]);
  });
});
