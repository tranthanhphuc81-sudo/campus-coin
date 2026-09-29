/**
 * FontSizeControl.tsx
 * Four-level text-size control (90% / 100% / 115% / 130%) backed by `useTheme()`'s `fontScale`.
 * Exports: FontSizeControl
 * Spec: docs/spec/08 §8.7 (accessibility – font scale)
 */
import { en } from '../i18n/en';
import { useTheme, type FontScale } from '../lib/theme/ThemeProvider';

const SCALES: FontScale[] = [0.9, 1, 1.15, 1.3];

const SCALE_LABEL: Record<FontScale, string> = {
  0.9: en.layout.fontSizeSmall,
  1: en.layout.fontSizeDefault,
  1.15: en.layout.fontSizeLarge,
  1.3: en.layout.fontSizeExtraLarge,
};

/** Button group letting the user pick one of four text-size multipliers. */
export function FontSizeControl() {
  const { fontScale, setFontScale } = useTheme();

  return (
    <div className="btn-group" role="group" aria-label={en.layout.fontSize}>
      {SCALES.map((scale) => (
        <button
          key={scale}
          type="button"
          className={`btn btn-sm ${fontScale === scale ? 'btn-primary' : 'btn-outline-secondary'}`}
          aria-pressed={fontScale === scale}
          title={SCALE_LABEL[scale]}
          onClick={() => setFontScale(scale)}
        >
          {Math.round(scale * 100)}%
        </button>
      ))}
    </div>
  );
}
