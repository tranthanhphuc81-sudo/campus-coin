/**
 * ProfileTab.tsx
 * "Profile" tab of Profile & Settings: editable full name, academic year, monthly allowance
 * baseline/savings goal, currency and timezone. Submits only the changed, whitelisted fields to
 * `PATCH /me` and updates the shared auth state on success.
 * Exports: ProfileTab
 * Spec: docs/spec/05a §5.2 (profile fields) · docs/spec/07 §7.3.1 (`PATCH /me`)
 */
import { AcademicYear, CurrencyCode, FULL_NAME_MAX_LENGTH } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { apiClient } from '../../../lib/apiClient/apiClient';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useAuth } from '../../../lib/auth/AuthContext';
import type { UserDto } from '../../../lib/auth/types';

const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const MONEY_MESSAGE = 'Must be a plain decimal amount, e.g. "250.00".';
const ACADEMIC_YEAR_VALUES = Object.values(AcademicYear);
const CURRENCY_VALUES = Object.values(CurrencyCode);

/** Validates an IANA timezone name using the runtime's own tz database (mirrors the backend check). */
function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Client-side mirror of the backend's `updateProfileSchema`, adapted for this form's `<select>`
 * "none" sentinel (`''` for academic year). Only used for inline validation feedback — the
 * server re-validates with the real shared schema and is the source of truth.
 */
const profileFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(FULL_NAME_MAX_LENGTH),
  academicYear: z.string(),
  monthlyAllowanceBaseline: z.string().refine((value) => value === '' || MONEY_PATTERN.test(value), MONEY_MESSAGE),
  monthlySavingsGoal: z.string().refine((value) => value === '' || MONEY_PATTERN.test(value), MONEY_MESSAGE),
  currency: z.enum(CurrencyCode),
  timezone: z.string().min(1, 'Timezone is required.').refine(isValidTimezone, 'Unknown timezone.'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

/**
 * Profile fields form (full name, academic year, allowance/savings goal, currency, timezone).
 * Only the fields the user actually changed are sent to `PATCH /me`; on success the shared
 * `AuthContext` user is refreshed from the response so the rest of the app updates immediately.
 */
export function ProfileTab() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: user?.fullName ?? '',
      academicYear: user?.academicYear ?? '',
      monthlyAllowanceBaseline: user?.monthlyAllowanceBaseline ?? '',
      monthlySavingsGoal: user?.monthlySavingsGoal ?? '',
      currency: user?.currency ?? CurrencyCode.USD,
      timezone: user?.timezone ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.patch<UserDto>('/me', body).then((r) => r.data),
  });

  // Guarded after hooks: the auth-gated route always has a user, but hooks must run unconditionally.
  if (!user) return null;

  async function onSubmit(data: ProfileFormValues) {
    // BR: only send fields the user actually touched — never re-send unrelated fields untouched
    // by this form (whitelist enforced again server-side by `updateProfileSchema.strict()`).
    const body: Record<string, unknown> = {};
    if (dirtyFields.fullName) body.fullName = data.fullName;
    if (dirtyFields.academicYear) body.academicYear = data.academicYear === '' ? null : data.academicYear;
    if (dirtyFields.monthlyAllowanceBaseline) {
      body.monthlyAllowanceBaseline = data.monthlyAllowanceBaseline === '' ? null : data.monthlyAllowanceBaseline;
    }
    if (dirtyFields.monthlySavingsGoal) {
      body.monthlySavingsGoal = data.monthlySavingsGoal === '' ? null : data.monthlySavingsGoal;
    }
    if (dirtyFields.currency) body.currency = data.currency;
    if (dirtyFields.timezone) body.timezone = data.timezone;

    if (Object.keys(body).length === 0) {
      showToast({ message: en.profileSettings.profile.saved });
      return;
    }

    try {
      const updated = await mutation.mutateAsync(body);
      setUser(updated);
      showToast({ message: en.profileSettings.profile.saved });
    } catch (err) {
      applyFieldErrors(setError, err as ApiError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="col-12 col-lg-8">
      <div className="mb-3">
        <label htmlFor="fullName" className="form-label">
          {en.profileSettings.profile.fullName}
        </label>
        <input
          id="fullName"
          type="text"
          className={`form-control ${errors.fullName ? 'is-invalid' : ''}`}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          {...register('fullName')}
        />
        {errors.fullName ? (
          <div id="fullName-error" className="invalid-feedback">
            {errors.fullName.message}
          </div>
        ) : null}
      </div>

      <div className="mb-3">
        <label htmlFor="academicYear" className="form-label">
          {en.profileSettings.profile.academicYear}
        </label>
        <select id="academicYear" className="form-select" {...register('academicYear')}>
          <option value="">{en.profileSettings.profile.academicYearNone}</option>
          {ACADEMIC_YEAR_VALUES.map((value) => (
            <option key={value} value={value}>
              {en.profileSettings.profile.academicYearOptions[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="col-sm-6 mb-3">
          <label htmlFor="monthlyAllowanceBaseline" className="form-label">
            {en.profileSettings.profile.allowance}
          </label>
          <input
            id="monthlyAllowanceBaseline"
            type="text"
            inputMode="decimal"
            className={`form-control ${errors.monthlyAllowanceBaseline ? 'is-invalid' : ''}`}
            aria-describedby={errors.monthlyAllowanceBaseline ? 'allowance-error' : undefined}
            {...register('monthlyAllowanceBaseline')}
          />
          {errors.monthlyAllowanceBaseline ? (
            <div id="allowance-error" className="invalid-feedback">
              {errors.monthlyAllowanceBaseline.message}
            </div>
          ) : null}
        </div>
        <div className="col-sm-6 mb-3">
          <label htmlFor="monthlySavingsGoal" className="form-label">
            {en.profileSettings.profile.savingsGoal}
          </label>
          <input
            id="monthlySavingsGoal"
            type="text"
            inputMode="decimal"
            className={`form-control ${errors.monthlySavingsGoal ? 'is-invalid' : ''}`}
            aria-describedby={errors.monthlySavingsGoal ? 'savingsGoal-error' : undefined}
            {...register('monthlySavingsGoal')}
          />
          {errors.monthlySavingsGoal ? (
            <div id="savingsGoal-error" className="invalid-feedback">
              {errors.monthlySavingsGoal.message}
            </div>
          ) : null}
        </div>
      </div>

      <div className="row">
        <div className="col-sm-6 mb-3">
          <label htmlFor="currency" className="form-label">
            {en.profileSettings.profile.currency}
          </label>
          <select id="currency" className="form-select" {...register('currency')}>
            {CURRENCY_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="col-sm-6 mb-3">
          <label htmlFor="timezone" className="form-label">
            {en.profileSettings.profile.timezone}
          </label>
          <input
            id="timezone"
            type="text"
            className={`form-control ${errors.timezone ? 'is-invalid' : ''}`}
            aria-describedby={errors.timezone ? 'timezone-error' : undefined}
            {...register('timezone')}
          />
          {errors.timezone ? (
            <div id="timezone-error" className="invalid-feedback">
              {errors.timezone.message}
            </div>
          ) : null}
        </div>
      </div>

      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
            {en.profileSettings.profile.saving}
          </>
        ) : (
          en.profileSettings.profile.save
        )}
      </button>
    </form>
  );
}
