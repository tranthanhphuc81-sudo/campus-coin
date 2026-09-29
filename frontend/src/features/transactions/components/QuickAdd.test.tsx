/**
 * QuickAdd.test.tsx
 * Verifies: the "N" keyboard shortcut opens the quick-add modal (but not while the user is
 * typing elsewhere), Esc closes it, and submitting an invalid amount shows a validation message
 * without ever calling the create-transaction API. Also verifies the AI category-suggestion chip
 * (render, auto-fill vs. manual-override, silent failure never blocking Save) — the AI
 * suggestion query is mocked separately from `apiClient.post` so assertions about the actual
 * transaction-create POST body are never polluted by the suggestion call.
 * Spec: docs/spec/05a §5.4.1 (quick-add: N opens, Enter saves, Esc closes) · docs/spec/05b (AI)
 */
import { AI_SUGGEST_DEBOUNCE_MS, type CategorySuggestionDto } from '@campuscoin/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../i18n/en';
import { ToastProvider } from '../../../components/ToastProvider';
import { QuickAddProvider, useQuickAdd } from './QuickAddContext';

vi.mock('../../../lib/apiClient/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', currency: 'USD', timezone: 'UTC' },
    isBootstrapping: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));
vi.mock('../../ai/api', () => ({ suggestCategory: vi.fn() }));

import { apiClient } from '../../../lib/apiClient/apiClient';
import { suggestCategory } from '../../ai/api';

const mockSuggest = vi.mocked(suggestCategory);

const FOOD_CATEGORY = { id: 1, name: 'Food', type: 'expense', icon: null, color: null, isDefault: true, isActive: true, sortOrder: 0 };
const TRANSPORT_CATEGORY = { id: 2, name: 'Transport', type: 'expense', icon: null, color: null, isDefault: true, isActive: true, sortOrder: 1 };
const FOOD_SUGGESTION: CategorySuggestionDto = { categoryId: 1, categoryName: 'Food', confidence: '0.850', tier: 3 };

function renderWithProviders(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [FOOD_CATEGORY, TRANSPORT_CATEGORY] });
  (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { id: 'txn-1' } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QuickAddProvider>{children}</QuickAddProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function OpenButton() {
  const { open } = useQuickAdd();
  return (
    <button type="button" onClick={open}>
      manual open
    </button>
  );
}

async function openQuickAdd() {
  renderWithProviders(<OpenButton />);
  fireEvent.click(screen.getByRole('button', { name: 'manual open' }));
  await screen.findByText(en.transactions.quickAdd.title);
  // Wait for the category `<select>`'s options to load before any test interacts with it — jsdom
  // ignores a `fireEvent.change` targeting a value with no matching `<option>` yet.
  await screen.findByRole('option', { name: FOOD_CATEGORY.name });
}

/**
 * Types a description and advances past the debounce window, then lets the (already-settled)
 * suggestion query's result propagate into a re-render. Fake timers are installed only for this
 * step and torn down immediately after — `openQuickAdd`'s own `findByText`/`findByRole` (called
 * before/after this) rely on real timers for their `waitFor` polling; and the debounce timer
 * advance and the query-settle flush must each run in their *own* `act()` call, since the fetch
 * only starts once the debounce-triggered render commits (see `flushQuery` in
 * `useCategorySuggestion.test.tsx` for the same fake-timer/TanStack Query interaction).
 */
async function typeDescription(text: string) {
  fireEvent.change(screen.getByLabelText(en.transactions.form.description), { target: { value: text } });
  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(AI_SUGGEST_DEBOUNCE_MS);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  vi.useRealTimers();
}

beforeEach(() => {
  mockSuggest.mockReset();
  mockSuggest.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('QuickAdd', () => {
  it('opens on the "N" shortcut, not while typing in a text field', async () => {
    renderWithProviders(
      <>
        <input aria-label="unrelated field" />
        <OpenButton />
      </>,
    );

    fireEvent.keyDown(screen.getByLabelText('unrelated field'), { key: 'n' });
    expect(screen.queryByText(en.transactions.quickAdd.title)).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'n' });
    expect(await screen.findByText(en.transactions.quickAdd.title)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderWithProviders(<OpenButton />);
    fireEvent.click(screen.getByRole('button', { name: 'manual open' }));
    expect(await screen.findByText(en.transactions.quickAdd.title)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByText(en.transactions.quickAdd.title)).not.toBeInTheDocument());
  });

  it('shows a validation message for an invalid amount and never calls the API', async () => {
    renderWithProviders(<OpenButton />);
    fireEvent.click(screen.getByRole('button', { name: 'manual open' }));
    await screen.findByText(en.transactions.quickAdd.title);

    fireEvent.change(screen.getByLabelText(en.transactions.form.amount), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: en.transactions.quickAdd.submit }));

    expect(await screen.findByText(/plain decimal amount/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('renders the "AI suggestion: Food (85%)" chip once the suggestion query resolves', async () => {
    mockSuggest.mockResolvedValue(FOOD_SUGGESTION);
    await openQuickAdd();

    await typeDescription('starbucks coffee');

    expect(await screen.findByText('AI suggestion: Food (85%)')).toBeInTheDocument();
  });

  it('auto-fills the suggested category when the user has not touched the category picker', async () => {
    mockSuggest.mockResolvedValue(FOOD_SUGGESTION);
    await openQuickAdd();

    await typeDescription('starbucks coffee');
    await screen.findByText('AI suggestion: Food (85%)');

    expect(screen.getByLabelText(en.transactions.form.category)).toHaveValue(String(FOOD_SUGGESTION.categoryId));
  });

  it('does not auto-fill when the user already picked a category', async () => {
    mockSuggest.mockResolvedValue(FOOD_SUGGESTION);
    await openQuickAdd();

    fireEvent.change(screen.getByLabelText(en.transactions.form.category), { target: { value: String(TRANSPORT_CATEGORY.id) } });
    await typeDescription('starbucks coffee');
    await screen.findByText('AI suggestion: Food (85%)');

    expect(screen.getByLabelText(en.transactions.form.category)).toHaveValue(String(TRANSPORT_CATEGORY.id));
  });

  it('still saves successfully when the suggestion query rejects (TC-17: AI errors never block Save)', async () => {
    mockSuggest.mockRejectedValue(new Error('AI unavailable'));
    await openQuickAdd();

    fireEvent.change(screen.getByLabelText(en.transactions.form.amount), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText(en.transactions.form.category), { target: { value: String(FOOD_CATEGORY.id) } });
    await typeDescription('some expense');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.transactions.quickAdd.submit }));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/transactions', expect.anything(), expect.anything()));
    const [, body] = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/transactions')!;
    expect(body.aiSuggestedCategoryId).toBeNull();
    expect(body.categorySource).toBeUndefined();
  });

  it('sends the suggested categoryId (not null) and never categorySource when the user overrides the suggestion', async () => {
    mockSuggest.mockResolvedValue(FOOD_SUGGESTION);
    await openQuickAdd();

    fireEvent.change(screen.getByLabelText(en.transactions.form.amount), { target: { value: '12.50' } });
    await typeDescription('starbucks coffee');
    await screen.findByText('AI suggestion: Food (85%)');

    // Override the auto-filled suggestion with a different category before saving.
    fireEvent.change(screen.getByLabelText(en.transactions.form.category), { target: { value: String(TRANSPORT_CATEGORY.id) } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.transactions.quickAdd.submit }));
    });

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/transactions', expect.anything(), expect.anything()));
    const [, body] = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls.find(([url]) => url === '/transactions')!;
    expect(body.categoryId).toBe(TRANSPORT_CATEGORY.id);
    expect(body.aiSuggestedCategoryId).toBe(FOOD_SUGGESTION.categoryId);
    expect(body.aiSuggestedCategoryId).not.toBe(body.categoryId);
    expect(body.categorySource).toBeUndefined();
  });
});
