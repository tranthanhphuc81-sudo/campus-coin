/**
 * TransactionsPage.ts
 * Page Object for the student transactions list (`/app/transactions`), its quick-add modal and the
 * detail/edit drawer (used for both single-tab edits and the two-tab optimistic-lock scenario).
 * Exports: TransactionsPage
 * Spec: docs/spec/05a §5.4 · Rules: BR-TX-05 (optimistic locking), BR-TX-07 (soft delete)
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Values accepted by {@link TransactionsPage.quickAdd}. `categoryLabel` is required (not optional):
 * quick-add's category picker only auto-fills from a *remembered* last-used category
 * (`localStorage`, per user+type — see `lastUsedCategory.ts`), which is never set in a brand-new
 * Playwright browser context, so an omitted category leaves the picker on its unselected
 * placeholder and the form silently refuses to submit (dialog never closes).
 */
export interface QuickAddInput {
  amount: string;
  description: string;
  categoryLabel: string;
  type?: 'Expense' | 'Income';
  txnDate?: string;
}

export class TransactionsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/app/transactions');
    await expect(this.page).toHaveURL(/\/app\/transactions$/);
  }

  /**
   * Filters the list down to rows whose description contains `text` (server-side `q` filter, no
   * debounce — see `useTransactionFilters.ts`). The demo accounts this suite reuses across every
   * spec can carry hundreds of transactions, and `fullyParallel` specs add several more dated
   * "today" concurrently, so a brand-new row is not reliably on page 1 of the unfiltered, 20-per-
   * page list — searching for its own (always distinctively-named) description makes every
   * row-lookup below immune to both dataset size and test-run ordering.
   */
  async searchFor(text: string): Promise<void> {
    await this.page.getByLabel('Search', { exact: true }).fill(text);
  }

  async openQuickAdd(): Promise<void> {
    // `.first()`: for a fresh student with no transactions yet, the PageHeader's own button AND
    // the EmptyState's action button render the exact same label at the same time.
    await this.page.getByRole('button', { name: '+ Add transaction' }).first().click();
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  /** Opens quick-add, fills the form and submits. Leaves the AI category chip alone unless picked. */
  async quickAdd(input: QuickAddInput): Promise<void> {
    await this.openQuickAdd();
    // The Expense/Income toggle is a Bootstrap `btn-check` (visually-hidden radio + a `<label>`
    // styled as the button) — its accessible role is a radio, not a button.
    if (input.type) await this.page.getByRole('dialog').getByText(input.type, { exact: true }).click();
    // `{ exact: true }` everywhere here: the transactions list's filter bar (e.g. "Min amount",
    // "Max amount", "Categories") stays mounted behind the modal, and `getByLabel` matches by
    // substring by default, so the plain field names alone would be ambiguous.
    await this.page.getByLabel('Amount', { exact: true }).fill(input.amount);
    await this.page.getByLabel('Description', { exact: true }).fill(input.description);
    if (input.txnDate) await this.page.getByLabel('Date', { exact: true }).fill(input.txnDate);
    await this.page.getByLabel('Category', { exact: true }).selectOption({ label: input.categoryLabel });
    // `exact: true`: the page header's own "+ Add transaction" button contains this as a substring.
    await this.page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await expect(this.page.getByRole('dialog')).not.toBeVisible();
    await this.expectRowVisible(input.description);
  }

  /** The AI suggestion chip rendered next to the Category label, once a suggestion has arrived. */
  aiSuggestionChip(): Locator {
    return this.page.locator('button.badge.text-bg-info');
  }

  /** Searches for `description` first (see {@link searchFor}) so the row is guaranteed on page 1. */
  async rowByDescription(description: string): Promise<Locator> {
    await this.searchFor(description);
    return this.page.locator('tr', { hasText: description }).first();
  }

  async openRowEditor(description: string): Promise<void> {
    const row = await this.rowByDescription(description);
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(this.page.getByRole('heading', { name: 'Edit transaction' })).toBeVisible();
  }

  /** Edits the currently-open drawer's description and saves. */
  async editOpenDrawerDescription(newDescription: string): Promise<void> {
    await this.page.getByLabel('Description').fill(newDescription);
    await this.page.getByRole('button', { name: 'Save changes' }).click();
  }

  async expectVersionConflictBanner(): Promise<void> {
    await expect(this.page.getByText('This transaction was changed elsewhere')).toBeVisible();
  }

  async deleteByDescription(description: string): Promise<void> {
    const row = await this.rowByDescription(description);
    await row.getByRole('button', { name: 'Delete' }).click();
    await this.page.getByRole('button', { name: 'Confirm' }).click();
  }

  async undoLastDelete(): Promise<void> {
    await this.page.getByRole('button', { name: 'Undo' }).click();
  }

  /**
   * Searches for `description` first (see {@link searchFor}), then asserts it shows up. `.first()`:
   * the list renders BOTH the desktop table and the mobile card list at once (CSS
   * `d-none`/`d-md-block`/`d-md-none` just hides whichever doesn't match the viewport — both stay
   * in the DOM), so any description text always resolves to 2 elements, not 1.
   */
  async expectRowVisible(description: string): Promise<void> {
    await this.searchFor(description);
    await expect(this.page.getByText(description).first()).toBeVisible();
  }

  async expectRowHidden(description: string): Promise<void> {
    await this.searchFor(description);
    await expect(this.page.getByText(description).first()).not.toBeVisible();
  }
}
