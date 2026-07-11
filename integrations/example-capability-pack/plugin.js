'use strict';

module.exports = {
  hooks: {
    preToolUse(ctx) {
      if (ctx && ctx.toolName === 'shell') {
        return {
          additionalContext: 'example-capability-pack: trusted shell review active',
        };
      }
      return {};
    },
    onRouteStart(ctx) {
      return {
        routeTag: 'example-capability-pack',
        goal: ctx && ctx.goal,
      };
    },
  },
};