export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  percent: number;
};

export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }

  if (password.length >= 12) {
    score += 1;
  }

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 1;
  }

  if (/\d/.test(password)) {
    score += 1;
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  const normalized = Math.min(4, score) as PasswordStrength["score"];

  return {
    score: normalized,
    percent: normalized * 25,
  };
}
