/**
 * RecurringRuleFormModal.tsx
 * Create/edit modal for a recurring rule. `type`/`startDate` are immutable once created (BR:
 * changing the anchor date or money direction means delete + recreate) so they are shown
 * read-only in edit mode. The weekly-vs-monthly/yearly day field is a client-side mirror of the
 * backend's cross-field check (`checkFrequencyFields` in `shared/src/schemas/recurring.ts`,
 * not exported) — the server re-validates and is the source of truth.
 * Exports: RecurringRuleFormModal
 * Spec: docs/spec/05a §5.4.2 (recurring transactions)
 */
import {
  RECURRING_INTERVAL_MAX,
  RecurringFrequency,
  TransactionType,
  localDateSchema,
  moneyStringSchema,
  type RecurringRuleDto,
} from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { todayLocalDate } from '../../../lib/dates';
import { useAuth } from '../../../lib/auth/AuthContext';
import { useCreateRecurringRuleMutation, useUpdateRecurringRuleMutation } from '../hooks';
import { CategoryPicker } from './CategoryPicker';

const formSchema = z
  .object({
    type: z.enum(TransactionType),
    categoryId: z.number().int().positive('Select a category.'),
    amount: moneyStringSchema,
    description: z.string().max(255),
    frequency: z.enum(RecurringFrequency),
    intervalCount: z.number().int().min(1).max(RECURRING_INTERVAL_MAX),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    startDate: localDateSchema,
    endDate: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.frequency === RecurringFrequency.WEEKLY) {
      if (!v.dayOfWeek) ctx.addIssue({ code: 'custom', path: ['dayOfWeek'], message: 'Select a day of the week.' });
    } else if (!v.dayOfMonth) {
      ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Select a day of the month.' });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must not be before start date.' });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface RecurringRuleFormModalProps {
  show: boolean;
  onClose: () => void;
  /** When set, edits this rule; otherwise creates a new one. */
  rule?: RecurringRuleDto;
}

/** Create/edit modal for a recurring rule (frequency, every-N, day-of-month/week, end date). */
export function RecurringRuleFormModal({ show, onClose, rule }: RecurringRuleFormModalProps) {
  const { user } = useAuth();
  const isEdit = rule !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);
  const createMutation = useCreateRecurringRuleMutation();
  const updateMutation = useUpdateRecurringRuleMutation();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      type: rule?.type ?? TransactionType.EXPENSE,
      categoryId: rule?.categoryId ?? 0,
      amount: rule?.amount ?? '',
      description: rule?.description ?? '',
      frequency: rule?.frequency ?? RecurringFrequency.MONTHLY,
      intervalCount: rule?.intervalCount ?? 1,
      dayOfMonth: rule?.dayOfMonth ?? undefined,
      dayOfWeek: rule?.dayOfWeek ?? undefined,
      startDate: rule?.startDate ?? todayLocalDate(user?.timezone),
      endDate: rule?.endDate ?? '',
    },
  });

  const type = useWatch({ control, name: 'type' });
  const frequency = useWatch({ control, name: 'frequency' });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const shared = {
      categoryId: values.categoryId,
      amount: values.amount,
      description: values.description.trim() === '' ? null : values.description.trim(),
      frequency: values.frequency,
      intervalCount: values.intervalCount,
      dayOfMonth: values.frequency === RecurringFrequency.WEEKLY ? null : (values.dayOfMonth ?? null),
      dayOfWeek: values.frequency === RecurringFrequency.WEEKLY ? (values.dayOfWeek ?? null) : null,
      endDate: values.endDate?.trim() ? values.endDate : null,
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: rule.id, input: shared });
      } else {
        await createMutation.mutateAsync({ type: values.type, startDate: values.startDate, ...shared });
      }
      reset();
      onClose();
    } catch (err) {
      const error = err as ApiError;
      applyFieldErrors(setError, error);
      if (Object.keys(error.fieldErrors).length === 0) setServerError(error.detail ?? error.title ?? en.errors.generic);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {isEdit ? en.transactions.recurring.editTitle : en.transactions.recurring.createTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {serverError ? (
          <div className="alert alert-danger" role="alert">
            {serverError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {!isEdit ? (
            <div className="btn-group w-100 mb-3" role="group" aria-label={en.transactions.form.typeToggleLabel}>
              <input
                type="radio"
                className="btn-check"
                id="rr-type-expense"
                checked={type === TransactionType.EXPENSE}
                onChange={() => setValue('type', TransactionType.EXPENSE)}
              />
              <label className="btn btn-outline-danger" htmlFor="rr-type-expense">
                {en.transactions.form.typeExpense}
              </label>
              <input
                type="radio"
                className="btn-check"
                id="rr-type-income"
                checked={type === TransactionType.INCOME}
                onChange={() => setValue('type', TransactionType.INCOME)}
              />
              <label className="btn btn-outline-success" htmlFor="rr-type-income">
                {en.transactions.form.typeIncome}
              </label>
            </div>
          ) : null}

          <div className="row">
            <div className="col-sm-6 mb-3">
              <label htmlFor="rr-amount" className="form-label">
                {en.transactions.form.amount}
              </label>
              <input
                id="rr-amount"
                type="text"
                inputMode="decimal"
                className={`form-control ${errors.amount ? 'is-invalid' : ''}`}
                {...register('amount')}
              />
              {errors.amount ? <div className="invalid-feedback">{errors.amount.message}</div> : null}
            </div>
            <div className="col-sm-6 mb-3">
              <label htmlFor="rr-category" className="form-label">
                {en.transactions.form.category}
              </label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <CategoryPicker
                    id="rr-category"
                    type={type}
                    value={field.value || null}
                    onChange={field.onChange}
                    invalid={!!errors.categoryId}
                    disabled={isEdit}
                  />
                )}
              />
              {errors.categoryId ? <div className="invalid-feedback d-block">{errors.categoryId.message}</div> : null}
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="rr-description" className="form-label">
              {en.transactions.form.description}
            </label>
            <input id="rr-description" type="text" className="form-control" {...register('description')} />
          </div>

          <div className="row">
            <div className="col-sm-6 mb-3">
              <label htmlFor="rr-frequency" className="form-label">
                {en.transactions.recurring.frequency}
              </label>
              <select id="rr-frequency" className="form-select" {...register('frequency')}>
                <option value={RecurringFrequency.WEEKLY}>{en.transactions.form.repeatWeekly}</option>
                <option value={RecurringFrequency.MONTHLY}>{en.transactions.form.repeatMonthly}</option>
                <option value={RecurringFrequency.YEARLY}>{en.transactions.form.repeatYearly}</option>
              </select>
            </div>
            <div className="col-sm-6 mb-3">
              <label htmlFor="rr-interval" className="form-label">
                {en.transactions.form.repeatEvery}
              </label>
              <input
                id="rr-interval"
                type="number"
                min={1}
                max={RECURRING_INTERVAL_MAX}
                className="form-control"
                {...register('intervalCount', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="row">
            <div className="col-sm-6 mb-3">
              {frequency === RecurringFrequency.WEEKLY ? (
                <>
                  <label htmlFor="rr-day-of-week" className="form-label">
                    {en.transactions.recurring.dayOfWeek}
                  </label>
                  <select
                    id="rr-day-of-week"
                    className={`form-select ${errors.dayOfWeek ? 'is-invalid' : ''}`}
                    {...register('dayOfWeek', { valueAsNumber: true })}
                  >
                    <option value="">{en.transactions.form.categoryPlaceholder}</option>
                    {en.transactions.recurring.weekdays.map((day, index) => (
                      <option key={day} value={index + 1}>
                        {day}
                      </option>
                    ))}
                  </select>
                  {errors.dayOfWeek ? <div className="invalid-feedback">{errors.dayOfWeek.message}</div> : null}
                </>
              ) : (
                <>
                  <label htmlFor="rr-day-of-month" className="form-label">
                    {en.transactions.recurring.dayOfMonth}
                  </label>
                  <input
                    id="rr-day-of-month"
                    type="number"
                    min={1}
                    max={31}
                    className={`form-control ${errors.dayOfMonth ? 'is-invalid' : ''}`}
                    {...register('dayOfMonth', { valueAsNumber: true })}
                  />
                  {errors.dayOfMonth ? <div className="invalid-feedback">{errors.dayOfMonth.message}</div> : null}
                </>
              )}
            </div>
            <div className="col-sm-6 mb-3">
              <label htmlFor="rr-start-date" className="form-label">
                {en.transactions.recurring.startDate}
              </label>
              <input id="rr-start-date" type="date" className="form-control" disabled={isEdit} {...register('startDate')} />
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="rr-end-date" className="form-label">
              {en.transactions.recurring.endDate}
            </label>
            <input
              id="rr-end-date"
              type="date"
              className={`form-control ${errors.endDate ? 'is-invalid' : ''}`}
              {...register('endDate')}
            />
            {errors.endDate ? <div className="invalid-feedback">{errors.endDate.message}</div> : null}
          </div>

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              {en.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {isEdit ? en.transactions.recurring.saving : en.transactions.recurring.creating}
                </>
              ) : isEdit ? (
                en.transactions.recurring.save
              ) : (
                en.transactions.recurring.create
              )}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
