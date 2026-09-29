/**
 * AppearanceTab.tsx
 * "Appearance" tab of Profile & Settings: colour theme and text-size controls. Both wrap
 * `useTheme()` (via `ThemeToggle`/`FontSizeControl`), which itself already debounced-PATCHes
 * `/me`, so this tab needs no submit button of its own.
 * Exports: AppearanceTab
 * Spec: docs/spec/08 §8.2 (theme), §8.7 (accessibility font scale)
 */
import { FontSizeControl } from '../../../components/FontSizeControl';
import { ThemeToggle } from '../../../components/ThemeToggle';
import { en } from '../../../i18n/en';

/** Appearance settings: colour theme + text-size, backed by the shared `ThemeProvider`. */
export function AppearanceTab() {
  return (
    <section>
      <h2 className="h5">{en.profileSettings.appearance.title}</h2>
      <div className="d-flex align-items-center gap-3 mb-3">
        <span>{en.profileSettings.appearance.themeLabel}</span>
        <ThemeToggle />
      </div>
      <div className="d-flex align-items-center gap-3">
        <span>{en.profileSettings.appearance.fontSizeLabel}</span>
        <FontSizeControl />
      </div>
    </section>
  );
}
