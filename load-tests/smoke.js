/**
 * Smoke test — quick sanity check that the site is up and responding.
 *
 * Run locally:  k6 run load-tests/smoke.js
 * Run against staging: k6 run load-tests/smoke.js -e BASE_URL=https://staging.loveiq.org
 *
 * 5 VUs, 30 seconds. Fails if p95 > 3s or error rate > 1%.
 */

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://www.loveiq.org";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<3000"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function smokeTest() {
  const pages = ["/", "/waitlist", "/about", "/api/health"];

  for (const path of pages) {
    const res = http.get(`${BASE_URL}${path}`, {
      tags: { page: path },
    });

    check(res, {
      [`${path} status 200`]: (r) => r.status === 200,
    });

    sleep(0.5);
  }
}
