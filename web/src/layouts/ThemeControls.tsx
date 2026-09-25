import { en } from "@/content/en";
import { useTheme, type FontScale } from "@/app/ThemeProvider";

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "90", label: "90%" },
  { value: "100", label: "100%" },
  { value: "115", label: "115%" },
  { value: "130", label: "130%" },
];

export default function ThemeControls() {
  const { fontScale, setFontScale, theme, toggleTheme } = useTheme();

  return (
    <div className="theme-controls">
      <label htmlFor="fontScaleSelect" className="visually-hidden">
        {en.layout.fontScaleLabel}
      </label>
      <select
        id="fontScaleSelect"
        value={fontScale}
        className="field-select"
        onChange={(event) => setFontScale(event.target.value as FontScale)}
        aria-label={en.layout.fontScaleLabel}
      >
        {FONT_OPTIONS.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn btn-outline"
        onClick={toggleTheme}
        aria-label={en.layout.themeToggleAriaLabel}
      >
        {theme === "dark" ? en.layout.switchToLight : en.layout.switchToDark}
      </button>
    </div>
  );
}
