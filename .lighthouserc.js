/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 30000,
      // Both arms of the landing test, by name: a bare "/" would audit whichever
      // arm the coin gave this run.
      url: [
        "http://localhost:3000/?variant=white_card",
        "http://localhost:3000/?variant=white_video",
        "http://localhost:3000/about",
      ],
      numberOfRuns: 1,
    },
    assert: {
      assertions: {
        // CI uses throttled mobile network — performance varies widely
        "categories:performance": ["warn", { minScore: 0.5 }],
        // axe E2E tests enforce WCAG 2.1 AA; Lighthouse enforces as blocking gate
        "categories:accessibility": ["error", { minScore: 0.85 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
