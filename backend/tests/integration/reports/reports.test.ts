/**
 * reports.test.ts
 * Integration tests for `/api/v1/reports/*` against real MySQL + Redis (skipped without
 * DATABASE_URL). Category-breakdown and daily-weekly use fixed historical dates (independent of
 * "today") so their hand-computed expected values never depend on when the suite runs;
 * income-vs-expense and the PDF export are anchored to the caller's current month, mirroring
 * `dashboard.test.ts`. Covers TC-21 (PDF export with Vietnamese diacritics, totals cross-checked
 * against the JSON reports) and Table 46 (`/reports/monthly/share` — 5/day — 429 on the 6th call).
 * C-M4: `POST /monthly/share` now queues onto `emailQueue` directly (a `report-share` job carrying
 * only identifiers, never the rendered PDF/HTML — see `reports.service.ts`'s `renderShareEmail`),
 * so `emailQueue.add` is mocked/spied instead of the old `queueEmail` wrapper. A separate
 * `renderShareEmail` describe block below exercises the worker-side rendering directly against
 * real MySQL, proving the email still gets sent correctly with the report attached.
 * Spec: docs/spec/05b §5.8 · docs/spec/07 §7.3.3 · docs/spec/12 (TC-21) · Table 46 ·
 *   docs/security/review-p19.md C-M4
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type * as QueuesModule from '../../../src/jobs/queues.js';

const emailQueueAddMock = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
vi.mock('../../../src/jobs/queues.js', async (importOriginal) => {
  const actual = await importOriginal<typeof QueuesModule>();
  return { ...actual, emailQueue: { add: emailQueueAddMock } };
});

const { createApp } = await import('../../../src/app.js');
const { prisma } = await import('../../../src/lib/prisma.js');
const { EMAIL_JOB_NAMES } = await import('../../../src/jobs/queues.js');
const { renderShareEmail } = await import('../../../src/modules/reports/reports.service.js');
const { createActiveUser, cleanupTestUsers, flushRateLimits } = await import('../../fixtures/auth.js');
const { addDays, firstDayOfMonth, lastDayOfMonth, todayInTimeZone } = await import('../../../src/lib/dates.js');

interface CategoryBreakdownItem {
  categoryId: number;
  amount: string;
  sharePct: number;
  transactionCount: number;
  previousAmount: string;
  changePct: number | null;
}
interface DailyItem {
  date: string;
  income: string;
  expense: string;
}
interface WeeklyItem {
  income: string;
  expense: string;
}

describe.skipIf(!process.env.DATABASE_URL)('/api/v1/reports', () => {
  const app = createApp();

  beforeEach(async () => {
    await flushRateLimits();
    emailQueueAddMock.mockClear();
  });

  afterEach(async () => {
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function loginAs(): Promise<{ userId: string; accessToken: string }> {
    const user = await createActiveUser();
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    return { userId: user.id, accessToken: res.body.accessToken as string };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function getDefaultCategory(type: 'income' | 'expense', name: string) {
    return prisma.category.findFirstOrThrow({ where: { isDefault: true, type, name } });
  }

  async function addTxn(
    accessToken: string,
    categoryId: number,
    type: 'income' | 'expense',
    amount: string,
    txnDate: string,
    description?: string,
  ): Promise<void> {
    const res = await request(app).post('/api/v1/transactions').set(auth(accessToken)).send({ type, categoryId, amount, txnDate, description });
    expect(res.status).toBe(201);
  }

  describe('GET /category-breakdown', () => {
    it('matches hand-computed totals/share%/count and the previous-period-of-the-same-length comparison', async () => {
      const { accessToken } = await loginAs();
      const food = await getDefaultCategory('expense', 'Food');
      const transport = await getDefaultCategory('expense', 'Transport');

      // Current window: 2024-03-10..2024-03-12 (3 days). Previous window (same length): 2024-03-07..2024-03-09.
      await addTxn(accessToken, food.id, 'expense', '30.00', '2024-03-10');
      await addTxn(accessToken, food.id, 'expense', '10.00', '2024-03-11');
      await addTxn(accessToken, transport.id, 'expense', '20.00', '2024-03-12');
      await addTxn(accessToken, food.id, 'expense', '20.00', '2024-03-08'); // lands in the previous window

      const res = await request(app)
        .get('/api/v1/reports/category-breakdown?from=2024-03-10&to=2024-03-12&type=expense')
        .set(auth(accessToken));
      expect(res.status).toBe(200);
      const body = res.body as {
        totalAmount: string;
        totalTransactionCount: number;
        previousFrom: string;
        previousTo: string;
        previousTotalAmount: string;
        changePct: number | null;
        items: CategoryBreakdownItem[];
      };

      expect(body.totalAmount).toBe('60.00');
      expect(body.totalTransactionCount).toBe(3);
      expect(body.previousFrom).toBe('2024-03-07');
      expect(body.previousTo).toBe('2024-03-09');
      expect(body.previousTotalAmount).toBe('20.00');
      expect(body.changePct).toBe(200); // (60 - 20) / 20 * 100

      const foodItem = body.items.find((i) => i.categoryId === food.id);
      expect(foodItem).toMatchObject({ amount: '40.00', sharePct: 67, transactionCount: 2, previousAmount: '20.00', changePct: 100 });

      const transportItem = body.items.find((i) => i.categoryId === transport.id);
      expect(transportItem).toMatchObject({ amount: '20.00', sharePct: 33, transactionCount: 1, previousAmount: '0.00', changePct: null });
    });

    it('rejects to before from (422)', async () => {
      const { accessToken } = await loginAs();
      const res = await request(app).get('/api/v1/reports/category-breakdown?from=2024-03-12&to=2024-03-10').set(auth(accessToken));
      expect(res.status).toBe(422);
    });
  });

  describe('GET /income-vs-expense', () => {
    it('matches hand-computed income/expense/net per month, oldest first', async () => {
      const { accessToken } = await loginAs();
      const food = await getDefaultCategory('expense', 'Food');
      const allowance = await getDefaultCategory('income', 'Allowance');
      const today = todayInTimeZone('Asia/Ho_Chi_Minh');
      const thisMonth = firstDayOfMonth(today);
      const prevMonthDate = addDays(thisMonth, -5);
      const prevMonth = firstDayOfMonth(prevMonthDate);

      await addTxn(accessToken, food.id, 'expense', '40.00', today);
      await addTxn(accessToken, allowance.id, 'income', '100.00', today);
      await addTxn(accessToken, food.id, 'expense', '20.00', prevMonthDate);
      await addTxn(accessToken, allowance.id, 'income', '50.00', prevMonthDate);

      const res = await request(app).get('/api/v1/reports/income-vs-expense?months=2').set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.months).toHaveLength(2);
      expect(res.body.months[0]).toMatchObject({ month: prevMonth, income: '50.00', expense: '20.00', net: '30.00' });
      expect(res.body.months[1]).toMatchObject({ month: thisMonth, income: '100.00', expense: '40.00', net: '60.00' });
    });
  });

  describe('GET /daily-weekly', () => {
    it('matches hand-computed daily totals, a lossless weekly rollup and the daily average for a fully-ended month', async () => {
      const { accessToken } = await loginAs();
      const food = await getDefaultCategory('expense', 'Food');
      const allowance = await getDefaultCategory('income', 'Allowance');

      await addTxn(accessToken, food.id, 'expense', '10.00', '2024-02-01');
      await addTxn(accessToken, food.id, 'expense', '5.00', '2024-02-01');
      await addTxn(accessToken, food.id, 'expense', '8.00', '2024-02-15');
      await addTxn(accessToken, allowance.id, 'income', '100.00', '2024-02-01');

      const res = await request(app).get('/api/v1/reports/daily-weekly?month=2024-02-01').set(auth(accessToken));
      expect(res.status).toBe(200);
      const body = res.body as { daily: DailyItem[]; weekly: WeeklyItem[]; averageDailyIncome: string; averageDailyExpense: string };

      expect(body.daily).toHaveLength(29); // 2024 is a leap year

      expect(body.daily.find((d) => d.date === '2024-02-01')).toMatchObject({ income: '100.00', expense: '15.00' });
      expect(body.daily.find((d) => d.date === '2024-02-15')).toMatchObject({ income: '0.00', expense: '8.00' });
      expect(body.daily.find((d) => d.date === '2024-02-02')).toMatchObject({ income: '0.00', expense: '0.00' });

      const weeklyIncomeSum = body.weekly.reduce((sum, w) => sum + Number(w.income), 0);
      const weeklyExpenseSum = body.weekly.reduce((sum, w) => sum + Number(w.expense), 0);
      expect(weeklyIncomeSum).toBeCloseTo(100, 2);
      expect(weeklyExpenseSum).toBeCloseTo(23, 2);

      expect(body.averageDailyIncome).toBe('3.45'); // 100 / 29
      expect(body.averageDailyExpense).toBe('0.79'); // 23 / 29
    });
  });

  describe('GET /monthly/export', () => {
    it('TC-21: generates a downloadable PDF with Vietnamese diacritics whose totals match the JSON reports', async () => {
      const { accessToken } = await loginAs();
      const food = await getDefaultCategory('expense', 'Food');
      const allowance = await getDefaultCategory('income', 'Allowance');
      const today = todayInTimeZone('Asia/Ho_Chi_Minh');
      const thisMonth = firstDayOfMonth(today);
      const monthEnd = lastDayOfMonth(thisMonth);

      await addTxn(accessToken, food.id, 'expense', '35.00', today, 'Cà phê sáng ở Ký túc xá');
      await addTxn(accessToken, allowance.id, 'income', '200.00', today);

      const res = await request(app).get(`/api/v1/reports/monthly/export?month=${thisMonth}&format=pdf`).set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain(`campuscoin-report-${thisMonth.slice(0, 7)}.pdf`);
      const buffer = res.body as Buffer;
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');

      const breakdownRes = await request(app)
        .get(`/api/v1/reports/category-breakdown?from=${thisMonth}&to=${monthEnd}&type=expense`)
        .set(auth(accessToken));
      expect(breakdownRes.body.totalAmount).toBe('35.00');

      const ieRes = await request(app).get('/api/v1/reports/income-vs-expense?months=1').set(auth(accessToken));
      expect(ieRes.body.months[0]).toMatchObject({ income: '200.00', expense: '35.00' });
    });
  });

  describe('POST /monthly/share', () => {
    it('C-M4: queues a report-share job carrying only identifiers (never the rendered PDF/HTML), and records an audit entry', async () => {
      const { accessToken, userId } = await loginAs();

      const res = await request(app).post('/api/v1/reports/monthly/share').set(auth(accessToken)).send({ toEmail: 'parent@example.com', message: 'FYI' });
      expect(res.status).toBe(202);
      expect(emailQueueAddMock).toHaveBeenCalledTimes(1);

      const [jobName, jobData] = emailQueueAddMock.mock.calls[0] as [string, Record<string, unknown>];
      expect(jobName).toBe(EMAIL_JOB_NAMES.REPORT_SHARE);
      expect(jobData).toMatchObject({ userId, toEmail: 'parent@example.com', message: 'FYI' });
      // The whole point of C-M4: no rendered attachment/HTML/text body in the persisted job data.
      expect(jobData.attachments).toBeUndefined();
      expect(jobData.html).toBeUndefined();
      expect(jobData.text).toBeUndefined();
      expect(JSON.stringify(jobData).length).toBeLessThan(500); // a rendered PDF would be tens of KB+

      const audit = await prisma.auditLog.findFirst({ where: { actorId: userId, action: 'report.shared' } });
      expect(audit).not.toBeNull();
    });

    it('Table 46: a 6th share within a day is rate-limited (429)', async () => {
      const { accessToken } = await loginAs();

      let last;
      for (let i = 0; i < 6; i += 1) {
        last = await request(app).post('/api/v1/reports/monthly/share').set(auth(accessToken)).send({ toEmail: 'parent@example.com' });
      }
      expect(last!.status).toBe(429);
      expect(emailQueueAddMock).toHaveBeenCalledTimes(5);
    });
  });

  describe('renderShareEmail (worker-side rendering, C-M4)', () => {
    it('renders the full email — including the PDF attachment — from just the queued job data', async () => {
      const { accessToken, userId } = await loginAs();
      const food = await getDefaultCategory('expense', 'Food');
      const today = todayInTimeZone('Asia/Ho_Chi_Minh');
      const month = firstDayOfMonth(today);
      await addTxn(accessToken, food.id, 'expense', '15.00', today);

      const mail = await renderShareEmail({ userId, month, toEmail: 'parent@example.com', message: 'FYI' });

      expect(mail.to).toBe('parent@example.com');
      expect(mail.subject).toContain('shared a CampusCoin report');
      expect(mail.text).toContain('FYI');
      expect(mail.attachments).toHaveLength(1);
      expect(mail.attachments![0]!.contentType).toBe('application/pdf');
      expect(Buffer.from(mail.attachments![0]!.contentBase64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
    });
  });
});
