/**
 * OnboardingPage.tsx
 * Full-page, 3-step onboarding wizard shown once after a student's first login
 * (`/app/onboarding`, registered outside `StudentLayout` in `app/router.tsx`). Steps: (1)
 * monthly allowance baseline, (2) monthly savings goal, (3) AI opt-in. "Skip for now" marks
 * onboarding as seen client-side only (no partial save); "Finish" on step 3 does the one and
 * only `PATCH /me` call with whatever the student actually entered.
 * Exports: default (OnboardingPage)
 * Spec: docs/spec/08 §8.3 (onboarding UI) · docs/spec/05a §5.2 (user profile fields)
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { UserDto } from '../../../lib/auth/types';
import { useAuth } from '../../../lib/auth/AuthContext';
import { apiClient } from '../../../lib/apiClient/apiClient';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';

/** Shared money-string convention (`shared/src/schemas`): plain decimal, up to 2 fraction digits. */
const MONEY_STRING_REGEX = /^\d{1,12}(\.\d{1,2})?$/;

const TOTAL_STEPS = 3;

/** Marks onboarding as seen for `userId`; best-effort only (private mode/disabled storage). */
function markOnboardingDone(userId: string): void {
  try {
    window.localStorage.setItem(`cc.onboarding.${userId}`, 'done');
  } catch {
    // ignore – re-showing the wizard next login is an acceptable fallback
  }
}

/**
 * 3-step onboarding wizard rendered at `/app/onboarding`. Renders its own minimal chrome
 * (no `PublicLayout`/`StudentLayout`) since it is a full-page flow, not a regular app page.
 */
export default function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [allowance, setAllowance] = useState('');
  const [allowanceError, setAllowanceError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState('');
  const [savingsGoalError, setSavingsGoalError] = useState<string | null>(null);
  const [aiOptIn, setAiOptIn] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ProtectedRoute (student-only) guarantees a non-null user by the time this page renders.
  const userId = user!.id;

  /** Validates a single money-string field; empty is valid (means "skip this field"). */
  function validateMoneyField(value: string): string | null {
    if (value.trim() === '') return null;
    return MONEY_STRING_REGEX.test(value.trim()) ? null : en.errors.validationFailed;
  }

  function handleSkip() {
    markOnboardingDone(userId);
    navigate('/app', { replace: true });
  }

  function handleBack() {
    setStep((current) => Math.max(1, current - 1));
  }

  function handleNext(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      const error = validateMoneyField(allowance);
      setAllowanceError(error);
      if (error) return;
      setStep(2);
      return;
    }
    if (step === 2) {
      const error = validateMoneyField(savingsGoal);
      setSavingsGoalError(error);
      if (error) return;
      setStep(3);
    }
  }

  async function handleFinish(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const body: Record<string, string | boolean> = { aiOptIn };
      if (allowance.trim() !== '') body.monthlyAllowanceBaseline = allowance.trim();
      if (savingsGoal.trim() !== '') body.monthlySavingsGoal = savingsGoal.trim();

      const response = await apiClient.patch<UserDto>('/me', body);
      setUser(response.data);
      markOnboardingDone(userId);
      showToast({ message: en.onboarding.doneToast });
      navigate('/app', { replace: true });
    } catch {
      setSaveError(en.errors.generic);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-body-tertiary py-4 px-3">
      <div className="card shadow-sm" style={{ maxWidth: '32rem', width: '100%' }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <span className="fw-bold fs-4">{en.app.name}</span>
            <div className="text-body-secondary small mt-1">{en.onboarding.stepLabel(step, TOTAL_STEPS)}</div>
          </div>

          <h1 className="h4 text-center mb-4">{en.onboarding.title}</h1>

          {step === 1 && (
            <form onSubmit={handleNext} noValidate>
              <h2 className="h5">{en.onboarding.allowance.title}</h2>
              <p className="text-body-secondary">{en.onboarding.allowance.body}</p>
              <div className="mb-3">
                <label htmlFor="onboarding-allowance" className="form-label">
                  {en.onboarding.allowance.label}
                </label>
                <input
                  id="onboarding-allowance"
                  type="text"
                  inputMode="decimal"
                  className={`form-control${allowanceError ? ' is-invalid' : ''}`}
                  value={allowance}
                  onChange={(event) => {
                    setAllowance(event.target.value);
                    setAllowanceError(null);
                  }}
                  aria-describedby={allowanceError ? 'onboarding-allowance-error' : undefined}
                  aria-invalid={allowanceError ? true : undefined}
                />
                {allowanceError && (
                  <div id="onboarding-allowance-error" className="invalid-feedback" role="alert">
                    {allowanceError}
                  </div>
                )}
              </div>
              {renderNav({ onBack: handleBack, showBack: false, onSkip: handleSkip, nextLabel: en.onboarding.next })}
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext} noValidate>
              <h2 className="h5">{en.onboarding.savingsGoal.title}</h2>
              <p className="text-body-secondary">{en.onboarding.savingsGoal.body}</p>
              <div className="mb-3">
                <label htmlFor="onboarding-savings-goal" className="form-label">
                  {en.onboarding.savingsGoal.label}
                </label>
                <input
                  id="onboarding-savings-goal"
                  type="text"
                  inputMode="decimal"
                  className={`form-control${savingsGoalError ? ' is-invalid' : ''}`}
                  value={savingsGoal}
                  onChange={(event) => {
                    setSavingsGoal(event.target.value);
                    setSavingsGoalError(null);
                  }}
                  aria-describedby={savingsGoalError ? 'onboarding-savings-goal-error' : undefined}
                  aria-invalid={savingsGoalError ? true : undefined}
                />
                {savingsGoalError && (
                  <div id="onboarding-savings-goal-error" className="invalid-feedback" role="alert">
                    {savingsGoalError}
                  </div>
                )}
              </div>
              {renderNav({ onBack: handleBack, showBack: true, onSkip: handleSkip, nextLabel: en.onboarding.next })}
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleFinish} noValidate>
              <h2 className="h5">{en.onboarding.aiOptIn.title}</h2>
              <p className="text-body-secondary">{aiOptIn ? en.onboarding.aiOptIn.bodyOn : en.onboarding.aiOptIn.bodyOff}</p>
              <div className="form-check form-switch mb-3">
                <input
                  id="onboarding-ai-opt-in"
                  type="checkbox"
                  role="switch"
                  className="form-check-input"
                  checked={aiOptIn}
                  onChange={(event) => setAiOptIn(event.target.checked)}
                />
                <label htmlFor="onboarding-ai-opt-in" className="form-check-label">
                  {en.onboarding.aiOptIn.label}
                </label>
              </div>
              {saveError && (
                <div className="alert alert-danger" role="alert">
                  {saveError}
                </div>
              )}
              {renderNav({
                onBack: handleBack,
                showBack: true,
                onSkip: handleSkip,
                nextLabel: en.onboarding.finish,
                isFinishStep: true,
                isSaving,
              })}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shared Back / Skip / Next-or-Finish navigation row rendered at the bottom of every step. */
function renderNav(options: {
  onBack: () => void;
  showBack: boolean;
  onSkip: () => void;
  nextLabel: string;
  isFinishStep?: boolean;
  isSaving?: boolean;
}) {
  const { onBack, showBack, onSkip, nextLabel, isFinishStep, isSaving } = options;
  return (
    <div className="d-flex align-items-center justify-content-between mt-4">
      <button
        type="button"
        className="btn btn-link px-0"
        onClick={onBack}
        disabled={!showBack}
        style={{ visibility: showBack ? 'visible' : 'hidden' }}
      >
        {en.onboarding.back}
      </button>
      <div className="d-flex align-items-center gap-3">
        <button type="button" className="btn btn-link text-decoration-underline" onClick={onSkip}>
          {en.onboarding.skip}
        </button>
        <button type="submit" className="btn btn-primary" disabled={isFinishStep && isSaving}>
          {isFinishStep && isSaving ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
              {en.onboarding.finishing}
            </>
          ) : (
            nextLabel
          )}
        </button>
      </div>
    </div>
  );
}
