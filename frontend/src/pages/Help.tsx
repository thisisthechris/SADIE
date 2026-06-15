import { Link } from "react-router-dom";
import { listTerms } from "../lib/glossary";

/**
 * Help page: Glossary of all terms used in the dashboard.
 */
export default function Help() {
  const terms = listTerms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-main">Help & Glossary</h1>
        <p className="body-lg">
          Definitions of key terms and concepts used throughout the dashboard.
        </p>
      </div>

      <div className="card p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {terms.map((term) => (
            <div key={term.term} className="border-b pb-4 last:border-0">
              <h3 className="heading-sub text-sm mb-1">{term.term}</h3>
              <p className="text-xs text-muted font-medium mb-2">{term.short}</p>
              <p className="text-xs text-muted/70 leading-relaxed">{term.long}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted">
        Can't find what you're looking for? Try{" "}
        <Link to="/search" className="underline hover:no-underline">
          searching
        </Link>{" "}
        for a specific view or metric.
      </div>
    </div>
  );
}
