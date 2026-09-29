/**
 * PasswordStrengthMeter.tsx
 * Client-side password strength indicator shown next to the password field on Register/Reset.
 * Purely a UX hint — the real policy (length, breach/common-password checks, BR-AU-02) is
 * enforced server-side; this heuristic never blocks submission.
 * Main exports: estimatePasswordStrength, PasswordStrengthMeter
 * Spec: docs/spec/05a Table 14 BR-AU-02 · docs/spec/08 §8.3 (password strength meter)
 */
import { en } from '../i18n/en';

/** Strength score from 0 (very weak) to 4 (strong). */
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

const LABELS: Record<PasswordStrengthScore, string> = {
  0: en.passwordStrength.veryWeak,
  1: en.passwordStrength.weak,
  2: en.passwordStrength.fair,
  3: en.passwordStrength.good,
  4: en.passwordStrength.strong,
};

const BAR_VARIANT: Record<PasswordStrengthScore, string> = {
  0: 'bg-danger',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-info',
  4: 'bg-success',
};

/**
 * Rough client-side strength estimate: length plus character-class variety. Purely advisory —
 * never treated as a validation gate (the server rejects short/common/breached passwords
 * regardless of what this reports).
 */
export function estimatePasswordStrength(password: string): PasswordStrengthScore {
  if (password.length === 0) return 0;

  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/\d/.test(password)) variety += 1;
  if (/[^A-Za-z0-9]/.test(password)) variety += 1;

  let lengthPoints = 0;
  if (password.length >= 10) lengthPoints += 1;
  if (password.length >= 14) lengthPoints += 1;
  if (password.length >= 20) lengthPoints += 1;

  const raw = Math.min(4, Math.floor((variety + lengthPoints) / 2));
  return (password.length < 10 ? Math.min(raw, 1) : raw) as PasswordStrengthScore;
}

interface PasswordStrengthMeterProps {
  password: string;
}

/** Visual strength bar + text label; renders nothing for an empty password. */
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (password.length === 0) return null;
  const score = estimatePasswordStrength(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="progress" style={{ height: '6px' }} role="presentation">
        <div
          className={`progress-bar ${BAR_VARIANT[score]}`}
          style={{ width: `${((score + 1) / 5) * 100}%` }}
        />
      </div>
      <small className="text-body-secondary">
        {en.passwordStrength.label}: {LABELS[score]}
      </small>
    </div>
  );
}
