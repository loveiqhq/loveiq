/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 30000,
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/about",
        "http://localhost:3000/waitlist",
      ],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        // CI uses throttled mobile network — performance varies widely
        "categories:performance": ["warn", { minScore: 0.5 }],
        // axe E2E tests enforce WCAG 2.1 AA; Lighthouse is a secondary signal
        "categories:accessibility": ["warn", { minScore: 0.85 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
