import i18next from 'eslint-plugin-i18next';

const prose = (value) => typeof value === 'string' && /[\p{L}]/u.test(value);
const textAttributes = new Set([
  'title',
  'placeholder',
  'alt',
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'label',
  'tooltip',
  'description',
]);
function visibleValue(node) {
  for (let parent = node.parent; parent; node = parent, parent = parent.parent) {
    switch (parent.type) {
      case 'JSXElement':
      case 'JSXFragment':
        return true;
      case 'JSXAttribute':
        return textAttributes.has(parent.name.name);
      case 'JSXExpressionContainer':
      case 'TemplateLiteral':
      case 'ArrayExpression':
      case 'SpreadElement':
      case 'TSAsExpression':
      case 'TSTypeAssertion':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
      case 'AwaitExpression':
        break;
      case 'ConditionalExpression':
        if (parent.test === node) return false;
        break;
      case 'LogicalExpression':
        // The left side of && is a predicate; || and ?? can return either operand.
        if (parent.operator === '&&' && parent.left === node) return false;
        break;
      case 'BinaryExpression':
        if (parent.operator !== '+') return false;
        break;
      case 'SequenceExpression':
        if (parent.expressions.at(-1) !== node) return false;
        break;
      default:
        // Calls (including t()), comparisons, property lookups and other arguments
        // do not directly produce this literal as rendered text.
        return false;
    }
  }
  return false;
}
const literalRule = i18next.rules['no-literal-string'];
export default {
  ...i18next,
  rules: {
    ...i18next.rules,
    'no-literal-string': {
      ...literalRule,
      create(context) {
        const visitors = literalRule.create(context);
        // Upstream silently exempts entire uppercase constants and default arguments.
        // Neither changes whether a string is user-facing; retain the ordinary literal checks.
        delete visitors.VariableDeclarator;
        delete visitors['VariableDeclarator:exit'];
        delete visitors.AssignmentPattern;
        delete visitors['AssignmentPattern:exit'];
        // File-scoped machine tokens must not exempt their spelling when it is rendered
        // directly as UI copy. Upstream also ignores several native accessible attributes.
        for (const type of ['Literal', 'JSXText', 'TemplateLiteral']) {
          const visit = visitors[type];
          visitors[type] = (node) => {
            const hasText =
              type === 'TemplateLiteral'
                ? node.quasis.some((part) => prose(part.value.cooked))
                : prose(node.value);
            if (visibleValue(node) && hasText)
              context.report({ node, message: 'Use a translation key for user-facing text.' });
            else visit(node);
          };
        }
        return visitors;
      },
    },
  },
};
