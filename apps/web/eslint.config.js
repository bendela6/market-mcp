import react from '@market/config/eslint/react';
import boundaries from '@market/config/eslint/boundaries';

const noUrlEscapeHatches = {
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/api-client.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXAttribute[name.name='href'] > Literal[value=/^\\//]",
        message:
          "Do not use raw href to internal routes. Use <Link to={WEB_PATHS.x} params={...}> from @tanstack/react-router so the route is type-checked.",
      },
      {
        selector: "JSXAttribute[name.name='href'] > JSXExpressionContainer > TemplateLiteral",
        message:
          "Do not use template-literal href. Use <Link to={WEB_PATHS.x} params={...}> from @tanstack/react-router so the route is type-checked.",
      },
      {
        selector: "CallExpression[callee.name='fetch']",
        message:
          "Do not call fetch() directly. Use the typed `api` object exported from src/api-client.ts (which centralizes API_PATHS + buildPath usage).",
      },
    ],
  },
};

export default [...react, ...boundaries, noUrlEscapeHatches];
