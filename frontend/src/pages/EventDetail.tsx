import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

// Types from EventDetailSerializer
interface EventCategory {
  id: number;
  name: string;
  slug: string;
}

interface EventOrg {
  id: number;
  slug: string;
  name: string;
  website?: string;
  is_partner?: boolean;
}

interface EventLocation {
  id: number;
  name: string;
}

interface EventDetail {
  id: number;
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string | null;
  url: string;
  source_url: string;
  image_url: string | null;
  organisation: EventOrg;
  location: EventLocation | null;
  categories: EventCategory[];
  created_at: string;
}

interface EventStats {
  event_id: number;
  unique_users: number;
  total_interactions: number;
  by_month: Array<{ month: string; count: number }>;
}

interface SimilarEvent {
  id: number;
  title: string;
  start_datetime: string | null;
  organisation: { id: number; name: string };
  location: { id: number; name: string } | null;
  url: string;
  score: number | null;
}

interface SimilarResponse {
  source_id: number;
  results: SimilarEvent[];
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return "";
  const d = new Date(dt);
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MiniBarChart({ data }: { data: Array<{ month: string; count: number }> }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((d) => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5 group">
          <div
            className="w-full bg-accent/60 rounded-t group-hover:bg-accent transition-colors"
            style={{ height: `${Math.max(4, (d.count / max) * 72)}px` }}
            title={`${d.month}: ${d.count}`}
          />
          <span className="text-[9px] text-muted/70 rotate-45 origin-left leading-none">
            {d.month.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function EventDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const eventId = parseInt(id, 10);

  const event = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: () => api<EventDetail>(`/api/events/${eventId}/`),
    enabled: !!eventId,
  });

  const stats = useQuery({
    queryKey: ["event-stats", eventId],
    queryFn: () => api<EventStats>(`/api/analytics/stats/event/${eventId}/`),
    enabled: !!eventId,
  });

  const similar = useQuery({
    queryKey: ["event-similar", eventId],
    queryFn: () =>
      api<SimilarResponse>(
        `/api/analytics/recommendations/similar/${eventId}/?limit=8`
      ),
    enabled: !!eventId,
  });

  if (event.isLoading) {
    return <div className="card p-6 text-sm text-muted">Loading…</div>;
  }
  if (event.isError || !event.data) {
    return (
      <div className="card p-6 text-sm text-red-400">
        Event not found.{" "}
        <button onClick={() => navigate(-1)} className="underline">
          Go back
        </button>
      </div>
    );
  }

  const e = event.data;
  const externalUrl = e.url || e.source_url;

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <button onClick={() => navigate(-1)} className="hover:text-foreground transition-colors">
          ← Back
        </button>
        <span>/</span>
        <Link to="/insights/calendar" className="hover:text-foreground transition-colors">
          Calendar
        </Link>
        <span>/</span>
        <span className="text-foreground truncate max-w-xs">{e.title}</span>
      </div>

      {/* Event header card */}
      <div className="card p-6 space-y-4">
        {/* Categories */}
        {e.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {e.categories.map((cat) => (
              <span
                key={cat.id}
                className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30"
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        <h1 className="heading-main leading-snug">{e.title}</h1>

        {/* Event image */}
        {e.image_url && (
          <img 
            src={e.image_url} 
            alt={e.title} 
            className="w-full max-h-64 object-cover rounded-lg"
          />
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {fmt(e.start_datetime)}
            {e.end_datetime && <span> – {fmt(e.end_datetime)}</span>}
          </span>

          {e.location && (
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {e.location.name}
            </span>
          )}

          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <Link
              to={`/insights/organisations/${e.organisation.slug}`}
              className="hover:text-accent transition-colors font-medium"
            >
              {e.organisation.name}
            </Link>
          </span>
        </div>

        {/* Description */}
        {e.description && (
          <p className="text-sm leading-relaxed text-muted/90 whitespace-pre-line">
            {e.description}
          </p>
        )}

        {/* External link */}
        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            View event page
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Stats + chart row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold">
            {stats.data?.unique_users ?? "—"}
          </div>
          <div className="text-xs text-muted mt-1">Unique visitors</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold">
            {stats.data?.total_interactions ?? "—"}
          </div>
          <div className="text-xs text-muted mt-1">Total interactions</div>
        </div>
        <div className="card p-4">
          {stats.data?.by_month && stats.data.by_month.length > 0 ? (
            <>
              <div className="text-xs text-muted mb-2">Interactions by month</div>
              <MiniBarChart data={stats.data.by_month} />
            </>
          ) : (
            <div className="text-xs text-muted">No interaction data</div>
          )}
        </div>
      </div>

      {/* Similar events */}
      {(similar.data?.results ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="heading-sub">
            Similar events
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similar.data!.results.map((s) => (
              <Link
                key={s.id}
                to={`/insights/events/${s.id}`}
                className="card p-3 hover:border-accent/50 transition-colors group"
              >
                <div className="text-sm font-medium group-hover:text-accent transition-colors line-clamp-2">
                  {s.title}
                </div>
                <div className="mt-1.5 text-xs text-muted space-y-0.5">
                  <div>{s.organisation.name}</div>
                  {s.start_datetime && (
                    <div>
                      {new Date(s.start_datetime).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  )}
                  {s.location && <div>{s.location.name}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Explore org button */}
      <div className="flex gap-3 pt-2">
        <Link
          to={`/insights/organisations/${e.organisation.slug}`}
          className="btn-secondary text-sm"
        >
          Explore {e.organisation.name}
        </Link>
        <Link
          to={`/insights/calendar?event=${e.id}`}
          className="btn-secondary text-sm"
        >
          View in calendar
        </Link>
      </div>
    </div>
  );
}
