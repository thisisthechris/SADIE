import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { LANDING } from "../lib/copy";

interface PublicPartner {
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
}

/** Contributing partners, loaded from the public (no login) partners endpoint. */
export default function PartnerList() {
  const partners = useQuery({
    queryKey: ["public-partners"],
    staleTime: 5 * 60_000,
    queryFn: () => api<PublicPartner[]>("/api/organisations/public/partners/"),
  });

  return (
    <section className="card p-6 w-full">
      <h2 className="text-sm font-semibold mb-3">{LANDING.partnersHeading}</h2>
      {partners.isLoading && <p className="text-sm text-muted">Loading partners…</p>}
      {partners.isError && <p className="text-sm text-muted">Partners could not be loaded.</p>}
      {partners.data && partners.data.length === 0 && <p className="text-sm text-muted">{LANDING.partnersEmpty}</p>}
      {partners.data && partners.data.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {partners.data.map((p) => (
            <li key={p.slug} className="rounded-full border border-border px-3 py-1 text-sm">
              {p.website ? (
                <a href={p.website} target="_blank" rel="noreferrer" className="hover:underline">
                  {p.name}
                </a>
              ) : (
                p.name
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
