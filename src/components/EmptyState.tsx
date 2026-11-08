import { Link } from 'react-router-dom';

interface EmptyStateProps {
  heading: string;
  body: string;
  to: string;
  cta: string;
}

export function EmptyState({ heading, body, to, cta }: EmptyStateProps) {
  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <h2>{heading}</h2>
        </div>
        <p className="muted">{body}</p>
        <p>
          <Link className="btn btn--primary" to={to}>
            {cta}
          </Link>
        </p>
      </div>
    </section>
  );
}
