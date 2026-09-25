import type { PropsWithChildren, ReactNode } from "react";

type AuthShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export default function AuthShell({ children, footer, subtitle, title }: AuthShellProps) {
  return (
    <section className="auth-shell" aria-labelledby="auth-title">
      <header>
        <h1 id="auth-title">{title}</h1>
        <p>{subtitle}</p>
      </header>
      {children}
      {footer ? <footer>{footer}</footer> : null}
    </section>
  );
}
