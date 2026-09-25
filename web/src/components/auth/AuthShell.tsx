import type { PropsWithChildren, ReactNode } from "react";

type AuthShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  footer?: ReactNode;
}>;

export default function AuthShell({ children, footer, subtitle, title }: AuthShellProps) {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "32rem",
        padding: "2rem 1rem",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      {children}
      {footer ? <footer style={{ marginTop: "1rem" }}>{footer}</footer> : null}
    </main>
  );
}
