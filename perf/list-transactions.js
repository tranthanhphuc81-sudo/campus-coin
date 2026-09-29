/**
 * list-transactions.js
 * k6 load test for GET /transactions (paginated list) against docs/spec/10 §10.1 Bảng 60:
 * "API đọc (danh sách, chi tiết)" p95 < 200 ms. Run: `k6 run perf/list-transactions.js`.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, BASE_URL } from './lib/auth.js';

export const options = {
  scenarios: {
    list: {
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
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return login();
}

export default function (data) {
  const page = 1 + Math.floor(Math.random() * 5);
  const res = http.get(`${BASE_URL}/api/v1/transactions?page=${page}&limit=20`, authHeaders(data.accessToken));
  check(res, { '200': (r) => r.status === 200 });
  sleep(1);
}
