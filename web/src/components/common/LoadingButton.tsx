import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type LoadingButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    isLoading?: boolean;
    loadingLabel: string;
  }
>;

export default function LoadingButton({
  children,
  isLoading = false,
  loadingLabel,
  disabled,
  className,
  ...rest
}: LoadingButtonProps) {
  return (
    <button
      {...rest}
      className={className ? `btn btn-primary ${className}` : "btn btn-primary"}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <span className="loading-inline" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>{loadingLabel}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
