type ErrorPageProps = {
  title: string;
  detail: string;
  actionLabel: string;
  onAction?: () => void;
};

export default function ErrorPage({ title, detail, actionLabel, onAction }: ErrorPageProps) {
  return (
    <main className="status-page" aria-labelledby="error-title">
      <p className="status-page__code">500</p>
      <h1 id="error-title">{title}</h1>
      <p>{detail}</p>
      <button type="button" className="btn btn-primary" onClick={onAction}>
        {actionLabel}
      </button>
    </main>
  );
}
