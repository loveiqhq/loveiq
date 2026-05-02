/**
 * Load test — sustained traffic simulating normal production load.
 *
 * Run locally:  k6 run load-tests/load.js
 * Run against target: k6 run load-tests/load.js -e BASE_URL=https://www.loveiq.org
 *
 * Ramps to 50 VUs over 30s, holds for 2 minutes, ramps down over 30s.
 * Fails if p95 > 3s or error rate > 1%.
 *
 * Tests pages only (no API writes) to avoid creating test data in production.
 * To test the waitlist API, point BASE_URL at a staging environment.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://www.loveiq.org";

export const options = {
  stages: [
    { duration: "30s", target: 50 }, // ramp up
    { duration: "2m", target: 50 }, // hold
    { duration: "30s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function loadTest() {
  // Weighted: landing page gets most traffic
  const pages = ["/", "/", "/", "/waitlist", "/about", "/glossary", "/api/health"];
  const path = pages[Math.floor(Math.random() * pages.length)];

  const res = http.get(`${BASE_URL}${path}`, {
    tags: { page: path },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "response time < 3s": (r) => r.timings.duration < 3000,
  });

  sleep(1);
}
