const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class SchemaEngine {
  constructor(yamlPath) {
    this.yamlPath = yamlPath || path.join(__dirname, 'orchestrator.yaml');
    this.schema = this.loadSchema();
  }

  loadSchema() {
    try {
      const fileContents = fs.readFileSync(this.yamlPath, 'utf8');
      return yaml.load(fileContents);
    } catch (e) {
      console.error('[SchemaEngine] Failed to load YAML schema:', e);
      throw e;
    }
  }

  evaluateCondition(condition, context) {
    if (!condition) return true;
    try {

      const keys = Object.keys(context || {});
      const values = Object.values(context || {});
      keys.push('context');
      values.push(context);
      const func = new Function(...keys, `return ${condition};`);
      return func(...values);
    } catch (e) {
      console.error(`[SchemaEngine] Failed to evaluate condition: ${condition}`, e);
      return false;
    }
  }

  getActiveRouteAndStep(context) {
    if (!this.schema?.routes) return null;
    if (context.transitionRoute) {
      const tr = this.schema.routes.find(r => r.id === context.transitionRoute);
      if (tr) return { route: tr, step: tr.steps[0] };
    }
    const r = this.schema.routes.find(r => this.evaluateCondition(r.condition, context));
    return r ? { route: r, step: r.steps[0] } : null;
  }

  renderTemplate(templateString, variables) {
    if (!templateString) return '';
    return templateString.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      return variables[key.trim()] || '';
    });
  }

  evaluateDynamicTools(dynamicAllowRules, context) {
    let extraTools = [];
    if (!dynamicAllowRules) return extraTools;
    
    const toolsCalled = context.tools_called || [];

    for (const rule of dynamicAllowRules) {
      const evalContext = { ...context, tools_called: toolsCalled };
      if (this.evaluateCondition(rule.if, evalContext)) {
        extraTools = extraTools.concat(rule.add);
      }
    }
    return extraTools;
  }
}

module.exports = SchemaEngine;
