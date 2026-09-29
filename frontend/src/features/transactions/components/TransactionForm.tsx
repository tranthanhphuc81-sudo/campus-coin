/**
 * TransactionForm.tsx
 * Shared income/expense form used by both the quick-add modal (`mode="create"`, with the
 * optional "Repeat" section) and the detail drawer's edit tab (`mode="edit"`, no repeat — a
 * generated transaction's recurring rule is edited from the Recurring page instead). Amount/date
 * validation reuse the shared Zod primitives so client and server agree byte-for-byte.
 * Exports: TransactionForm, TransactionFormValues
 * Spec: docs/spec/05a §5.4.1 (quick-add form) · Rules: BR-TX-01..04
 */
import {
  DESCRIPTION_MAX_LENGTH,
  RECURRING_INTERVAL_MAX,
  RecurringFrequency,
  TransactionType,
  localDateSchema,
  moneyStringSchema,
} from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { todayLocalDate } from '../../../lib/dates';
import { useAuth } from '../../../lib/auth/AuthContext';
import { getLastUsedCategory } from '../lastUsedCategory';
import { useCategorySuggestion } from '../useCategorySuggestion';
import { CategoryPicker } from './CategoryPicker';

const REPEAT_UNIT: Record<RecurringFrequency, 'week' | 'month' | 'year'> = {
  [RecurringFrequency.WEEKLY]: 'week',
  [RecurringFrequency.MONTHLY]: 'month',
  [RecurringFrequency.YEARLY]: 'year',
};

/**
 * Values produced by a successful submit; `repeat` is only ever populated in `mode="create"`.
 * `aiSuggestedCategoryId`/`aiConfidence` are always present (possibly `null`) in create mode; in
 * edit mode they are omitted entirely unless a fresh suggestion was generated during this edit
 * session (i.e. the description was changed), so the caller can leave them out of the PATCH body
 * and let the server keep the transaction's stored AI provenance untouched (see
 * `TransactionDetailDrawer`).
 */
export interface TransactionFormValues {
  type: TransactionType;
  amount: string;
  txnDate: string;
  description: string | null;
  categoryId: number;
  aiSuggestedCategoryId?: number | null;
  aiConfidence?: string | null;
  repeat: { frequency: RecurringFrequency; intervalCount: number; endDate: string | null } | null;
}

function buildSchema(isVnd: boolean) {
  const amountSchema = isVnd
    ? moneyStringSchema.refine((v) => !v.includes('.'), en.transactions.form.vndWholeNumberHint)
    : moneyStringSchema;

  const base = z.object({
    type: z.enum(TransactionType),
    amount: amountSchema,
    txnDate: localDateSchema,
    description: z.string().max(DESCRIPTION_MAX_LENGTH, `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`),
    categoryId: z.number().int().positive('Select a category.'),
    // The <select>'s "Doesn't repeat" option submits `''`, not `undefined` — accept it directly
    // (rather than `.optional()`, whose Input/Output types diverge and confuse the RHF resolver)
    // and treat it as "no repeat" wherever this field is read.
    repeatFrequency: z.union([z.literal(''), z.enum(RecurringFrequency)]),
    repeatIntervalCount: z.number().int().min(1).max(RECURRING_INTERVAL_MAX),
    repeatEndDate: z
      .string()
      .optional()
      .refine((v) => !v || localDateSchema.safeParse(v).success, 'Must be a valid date.'),
  });
  // Always applied (even in edit mode, where repeatFrequency is never set) so `buildSchema`
  // returns one consistent Zod type regardless of `mode`.
  return base.superRefine((v, ctx) => {
    if (v.repeatFrequency && v.repeatEndDate && v.repeatEndDate < v.txnDate) {
      ctx.addIssue({ code: 'custom', path: ['repeatEndDate'], message: 'End date must not be before the transaction date.' });
    }
  });
}

type RawFormValues = z.infer<ReturnType<typeof buildSchema>>;

interface TransactionFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<TransactionFormValues>;
  /** May reject with an {@link ApiError} — field errors are applied to this form automatically. */
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  /** Called on any failed submit, in addition to this form's own field/generic error display — lets the
   * caller special-case e.g. a 409 version conflict with its own UI. */
  onError?: (error: ApiError) => void;
  onCancel?: () => void;
  submitLabel: string;
  submittingLabel: string;
  autoFocusAmount?: boolean;
  formId?: string;
}

/** Income/expense form: type toggle, amount, date, description, category, and (create-only) repeat. */
export function TransactionForm({
  mode,
  defaultValues,
  onSubmit,
  onError,
  onCancel,
  submitLabel,
  submittingLabel,
  autoFocusAmount,
  formId,
}: TransactionFormProps) {
  const { user } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const isVnd = user?.currency === 'VND';
  const schema = useMemo(() => buildSchema(isVnd), [isVnd]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RawFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultValues?.type ?? TransactionType.EXPENSE,
      amount: defaultValues?.amount ?? '',
      txnDate: defaultValues?.txnDate ?? todayLocalDate(user?.timezone),
      description: defaultValues?.description ?? '',
      categoryId: defaultValues?.categoryId ?? 0,
      repeatFrequency: defaultValues?.repeat?.frequency ?? '',
      repeatIntervalCount: defaultValues?.repeat?.intervalCount ?? 1,
      repeatEndDate: defaultValues?.repeat?.endDate ?? '',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const description = useWatch({ control, name: 'description' });
  const repeatFrequency = useWatch({ control, name: 'repeatFrequency' });
  const repeatIntervalCount = useWatch({ control, name: 'repeatIntervalCount' });

  // BR-AI: whether the user has manually picked a category this session — once true, the AI
  // suggestion auto-fill effect (create mode only) never overwrites their choice.
  const categoryTouchedRef = useRef(false);

  // Quick-add only: default the category picker to whatever category was last used for this
  // type, and re-apply it whenever the Expense/Income toggle switches (spec §5.4.1).
  // Depends on `userId` (not the whole `user` object) so this only re-runs when the signed-in
  // user actually changes, not on every render of a caller whose `useAuth()` returns a fresh
  // object reference each time.
  const userId = user?.id;
  useEffect(() => {
    if (mode !== 'create' || !userId) return;
    categoryTouchedRef.current = false;
    const remembered = getLastUsedCategory(userId, type);
    setValue('categoryId', remembered ?? 0);
  }, [type, mode, userId, setValue]);

  // An edit-mode form must not spend AI quota just from being opened — only once the description
  // has actually been edited from its original (stored) value do we start suggesting, and only
  // then do we send fresh `aiSuggestedCategoryId`/`aiConfidence` back on submit.
  const originalDescription = defaultValues?.description ?? '';
  const suggestSessionActive = mode === 'create' || (description ?? '') !== originalDescription;

  const { suggestion, isSuggesting } = useCategorySuggestion({
    description: description ?? '',
    type,
    enabled: suggestSessionActive,
  });

  // Create mode only: auto-fill the category from the AI suggestion as soon as one arrives,
  // unless the user has already manually picked a category this session.
  useEffect(() => {
    if (mode !== 'create' || !suggestion || categoryTouchedRef.current) return;
    setValue('categoryId', suggestion.categoryId);
  }, [mode, suggestion, setValue]);

  async function submit(values: RawFormValues) {
    setServerError(null);
    try {
      await onSubmit({
        type: values.type,
        amount: values.amount,
        txnDate: values.txnDate,
        description: values.description.trim() === '' ? null : values.description.trim(),
        categoryId: values.categoryId,
        // D1 (P10): the server derives `categorySource` itself from these two fields plus a
        // learned-rule lookup — always send them (possibly `null`) in create mode; in edit mode
        // only when a fresh suggestion session ran, so an untouched-description edit never wipes
        // the transaction's stored AI provenance.
        ...(suggestSessionActive
          ? { aiSuggestedCategoryId: suggestion?.categoryId ?? null, aiConfidence: suggestion?.confidence ?? null }
          : {}),
        repeat:
          mode === 'create' && values.repeatFrequency
            ? {
                frequency: values.repeatFrequency,
                intervalCount: values.repeatIntervalCount,
                endDate: values.repeatEndDate?.trim() ? values.repeatEndDate : null,
              }
            : null,
      });
    } catch (err) {
      const error = err as ApiError;
      applyFieldErrors(setError, error);
      // A 409 version conflict gets its own dedicated UI from the caller (see `onError`), not a
      // generic alert here.
      if (Object.keys(error.fieldErrors).length === 0 && error.status !== 409) {
        setServerError(error.detail ?? error.title ?? en.errors.generic);
      }
      onError?.(error);
    }
  }

  const unit = repeatFrequency ? REPEAT_UNIT[repeatFrequency] : 'month';

  return (
    <form id={formId} onSubmit={handleSubmit(submit)} noValidate>
      {serverError ? (
        <div className="alert alert-danger" role="alert">
          {serverError}
        </div>
      ) : null}
      <div className="btn-group w-100 mb-3" role="group" aria-label={en.transactions.form.typeToggleLabel}>
        <input
          type="radio"
          className="btn-check"
          id={`${formId ?? 'txn'}-type-expense`}
          value={TransactionType.EXPENSE}
          checked={type === TransactionType.EXPENSE}
          onChange={() => setValue('type', TransactionType.EXPENSE)}
        />
        <label className="btn btn-outline-danger" htmlFor={`${formId ?? 'txn'}-type-expense`}>
          {en.transactions.form.typeExpense}
        </label>
        <input
          type="radio"
          className="btn-check"
          id={`${formId ?? 'txn'}-type-income`}
          value={TransactionType.INCOME}
          checked={type === TransactionType.INCOME}
          onChange={() => setValue('type', TransactionType.INCOME)}
        />
        <label className="btn btn-outline-success" htmlFor={`${formId ?? 'txn'}-type-income`}>
          {en.transactions.form.typeIncome}
        </label>
      </div>

      <div className="mb-3">
        <label htmlFor={`${formId ?? 'txn'}-amount`} className="form-label">
          {en.transactions.form.amount}
        </label>
        <input
          id={`${formId ?? 'txn'}-amount`}
          type="text"
          inputMode="decimal"
          // spec §5.4.1: the quick-add MODAL (not page load) must focus the amount field on open,
          // matching the WAI-ARIA dialog pattern of moving focus into a just-opened dialog.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocusAmount}
          className={`form-control ${errors.amount ? 'is-invalid' : ''}`}
          aria-describedby={errors.amount ? `${formId ?? 'txn'}-amount-error` : undefined}
          {...register('amount')}
        />
        {errors.amount ? (
          <div id={`${formId ?? 'txn'}-amount-error`} className="invalid-feedback">
            {errors.amount.message}
          </div>
        ) : null}
      </div>

      <div className="row">
        <div className="col-sm-6 mb-3">
          <label htmlFor={`${formId ?? 'txn'}-date`} className="form-label">
            {en.transactions.form.date}
          </label>
          <input
            id={`${formId ?? 'txn'}-date`}
            type="date"
            className={`form-control ${errors.txnDate ? 'is-invalid' : ''}`}
            aria-describedby={errors.txnDate ? `${formId ?? 'txn'}-date-error` : undefined}
            {...register('txnDate')}
          />
          {errors.txnDate ? (
            <div id={`${formId ?? 'txn'}-date-error`} className="invalid-feedback">
              {errors.txnDate.message}
            </div>
          ) : null}
        </div>
        <div className="col-sm-6 mb-3">
          {/* The AI suggestion chip lives in a sibling div, not inside the <label>, so it never
              pollutes the category <select>'s accessible name with dynamic suggestion text. */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <label htmlFor={`${formId ?? 'txn'}-category`} className="form-label mb-1">
              {en.transactions.form.category}
            </label>
            {isSuggesting ? (
              <span className="small text-body-secondary mb-1" role="status" aria-live="polite">
                {en.transactions.form.aiSuggestionLoading}
              </span>
            ) : suggestion ? (
              <button
                type="button"
                className="badge text-bg-info border-0 mb-1"
                onClick={() => {
                  categoryTouchedRef.current = true;
                  setValue('categoryId', suggestion.categoryId);
                }}
                title={en.transactions.form.useSuggestion}
              >
                <i className="bi bi-stars" aria-hidden="true" />{' '}
                {en.transactions.form.aiSuggestionChipLabel(suggestion.categoryName, Math.round(Number(suggestion.confidence) * 100))}
              </button>
            ) : null}
          </div>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <CategoryPicker
                id={`${formId ?? 'txn'}-category`}
                type={type}
                value={field.value || null}
                onChange={(categoryId) => {
                  categoryTouchedRef.current = true;
                  field.onChange(categoryId);
                }}
                invalid={!!errors.categoryId}
                describedBy={errors.categoryId ? `${formId ?? 'txn'}-category-error` : undefined}
              />
            )}
          />
          {errors.categoryId ? (
            <div id={`${formId ?? 'txn'}-category-error`} className="invalid-feedback d-block">
              {errors.categoryId.message}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor={`${formId ?? 'txn'}-description`} className="form-label">
          {en.transactions.form.description}
        </label>
        <input
          id={`${formId ?? 'txn'}-description`}
          type="text"
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder={en.transactions.form.descriptionPlaceholder}
          className={`form-control ${errors.description ? 'is-invalid' : ''}`}
          {...register('description')}
        />
      </div>

      {mode === 'create' ? (
        <div className="mb-3">
          <label htmlFor={`${formId ?? 'txn'}-repeat`} className="form-label">
            {en.transactions.form.repeat}
          </label>
          <select id={`${formId ?? 'txn'}-repeat`} className="form-select mb-2" {...register('repeatFrequency')}>
            <option value="">{en.transactions.form.repeatNone}</option>
            <option value={RecurringFrequency.WEEKLY}>{en.transactions.form.repeatWeekly}</option>
            <option value={RecurringFrequency.MONTHLY}>{en.transactions.form.repeatMonthly}</option>
            <option value={RecurringFrequency.YEARLY}>{en.transactions.form.repeatYearly}</option>
          </select>
          {repeatFrequency ? (
            <div className="row">
              <div className="col-sm-6 mb-2">
                <label htmlFor={`${formId ?? 'txn'}-repeat-every`} className="form-label small">
                  {en.transactions.form.repeatEvery}
                </label>
                <div className="input-group">
                  <input
                    id={`${formId ?? 'txn'}-repeat-every`}
                    type="number"
                    min={1}
                    max={RECURRING_INTERVAL_MAX}
                    className="form-control"
                    {...register('repeatIntervalCount', { valueAsNumber: true })}
                  />
                  <span className="input-group-text">{en.transactions.form.repeatEveryUnit(repeatIntervalCount ?? 1, unit)}</span>
                </div>
              </div>
              <div className="col-sm-6 mb-2">
                <label htmlFor={`${formId ?? 'txn'}-repeat-end`} className="form-label small">
                  {en.transactions.form.repeatEndDate}
                </label>
                <input
                  id={`${formId ?? 'txn'}-repeat-end`}
                  type="date"
                  className={`form-control ${errors.repeatEndDate ? 'is-invalid' : ''}`}
                  {...register('repeatEndDate')}
                />
                {errors.repeatEndDate ? <div className="invalid-feedback">{errors.repeatEndDate.message}</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="d-flex gap-2 justify-content-end">
        {onCancel ? (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            {en.common.cancel}
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              {submittingLabel}
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
    </form>
  );
}
