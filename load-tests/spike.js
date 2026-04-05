/**
 * Spike test — simulates a sudden viral traffic burst (e.g., viral social post).
 *
 * Run locally:  k6 run load-tests/spike.js
 * Run against target: k6 run load-tests/spike.js -e BASE_URL=https://www.loveiq.org
 *
 * Jumps from 0 to 100 VUs in 10 seconds, holds for 1 minute, drops immediately.
 * Thresholds are more lenient than load test — we expect some slowdown under a spike.
 * Fails if p95 > 5s or error rate > 5%.
 *
 * Also tests that /api/waitlist POST with no CSRF returns 403, not 500
 * (verifies the route is alive and processing requests).
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://www.loveiq.org";

export const options = {
  stages: [
    { duration: "10s", target: 100 }, // instant spike
    { duration: "1m", target: 100 }, // hold at peak
    { duration: "5s", target: 0 }, // drop
  ],
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    // Exclude waitlist API probe (expected 403) from failure rate
    "http_req_failed{page:/}": ["rate<0.05"],
    "http_req_failed{page:/api/health}": ["rate<0.05"],
  },
};

export default function spikeTest() {
  // Mix of page loads and API health checks under spike conditions
  const path = Math.random() < 0.8 ? "/" : "/api/health";
  const res = http.get(`${BASE_URL}${path}`, {
    tags: { page: path },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
  });

  // Also probe the waitlist API — expects 403 (CSRF missing), not 500
  if (Math.random() < 0.2) {
    const apiRes = http.post(
      `${BASE_URL}/api/waitlist`,
      JSON.stringify({ email: "test@test.com" }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { page: "/api/waitlist" },
      }
    );
    check(apiRes, {
      "waitlist API alive (403 CSRF, not 500)": (r) => r.status === 403,
    });
  }

  sleep(0.2);
}
