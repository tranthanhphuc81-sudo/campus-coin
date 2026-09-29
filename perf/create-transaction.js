/**
 * create-transaction.js
 * k6 load test for POST /transactions against docs/spec/10 §10.1 Bảng 60:
 * "API ghi (tạo/sửa giao dịch)" p95 < 300 ms. Run: `k6 run perf/create-transaction.js`.
 * Writes real rows against the demo student's account — safe to run repeatedly against a
 * staging/local seed (re-seed with `npm run db:seed -w backend -- --demo` to reset), NEVER
 * against a real production database with real user data.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, BASE_URL } from './lib/auth.js';

export const options = {
  scenarios: {
    create: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  return login();
}

export default function (data) {
  const body = JSON.stringify({
    type: 'expense',
    categoryId: data.categoryId,
    amount: (Math.random() * 100 + 1).toFixed(2),
    txnDate: '2026-06-15',
    description: 'k6 load test transaction',
  });
  const res = http.post(`${BASE_URL}/api/v1/transactions`, body, authHeaders(data.accessToken));
  check(res, { '201': (r) => r.status === 201 });
  sleep(1);
}
