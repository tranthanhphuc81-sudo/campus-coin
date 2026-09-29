/**
 * dashboard-summary.js
 * k6 load test for GET /dashboard/summary against docs/spec/10 §10.1 Bảng 60:
 * p95 < 400 ms (cache miss) / < 50 ms (cache hit). Run: `k6 run perf/dashboard-summary.js`
 * (needs a running API + the demo seed loaded — see perf/lib/auth.js). Override the target with
 * `-e BASE_URL=https://staging.campuscoin.example.com`.
 *
 * Each VU alternates months so roughly half the requests are a genuine cache miss (Redis TTL 60s,
 * docs/spec/10 §10.3) and half re-hit the same key within the same iteration — a rough proxy for
 * the two separate targets above, not a precise split (a real cache-hit-only number is easier to
 * read straight from `docs/perf.md`'s Redis GET latency log instead).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, BASE_URL } from './lib/auth.js';

export const options = {
  scenarios: {
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return login();
}

export default function (data) {
  // month = the first day of the calendar month (localDateSchema requires a full YYYY-MM-DD).
  const month = Math.random() < 0.5 ? '2026-06-01' : '2026-05-01';
  const res = http.get(`${BASE_URL}/api/v1/dashboard/summary?month=${month}`, authHeaders(data.accessToken));
  check(res, { '200': (r) => r.status === 200 });
  sleep(1);
}
