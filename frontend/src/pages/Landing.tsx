import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Logo from "../components/Logo";
import { api } from "../lib/api";
import { LANDING, SECTIONS } from "../lib/copy";

interface PublicPartner {
  name: string;
  slug: string;
  website: string | null;
  description: string | null;
}

export default function Landing() {
  const partners = useQuery({
    queryKey: ["public-partners"],
    queryFn: () => api<PublicPartner[]>("/api/organisations/public/partners/"),
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="text-center">
        <div className="flex justify-center mb-12">
          <Logo />
        </div>
        
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          SADIE
        </h1>

        <p className="text-lg text-slate-700 mb-2">{LANDING.tagline}</p>
        <p className="max-w-2xl mx-auto text-slate-600 mb-8">{LANDING.intro}</p>

        
        <Link
          to="/login"
          className="btn-primary"
        >
          Sign In
        </Link>

        <p className="max-w-2xl mx-auto text-sm text-slate-500 mt-10">{LANDING.scopeNote}</p>

        <section className="max-w-3xl mx-auto mt-10 text-left">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">{LANDING.partnersHeading}</h2>
          {partners.isLoading && <p className="text-slate-500">Loading partners…</p>}
          {partners.isError && <p className="text-slate-500">Partners could not be loaded.</p>}
          {partners.data && partners.data.length === 0 && (
            <p className="text-slate-500">{LANDING.partnersEmpty}</p>
          )}
          {partners.data && partners.data.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {partners.data.map((p) => (
                <li key={p.slug} className="rounded-lg bg-white p-4 shadow-sm">
                  <div className="font-medium text-slate-900">
                    {p.website ? (
                      <a href={p.website} target="_blank" rel="noreferrer" className="hover:underline">
                        {p.name}
                      </a>
                    ) : (
                      p.name
                    )}
                  </div>
                  {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="max-w-3xl mx-auto mt-10 text-left">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">{LANDING.sectionsHeading}</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map((key) => (
              <div key={key} className="rounded-lg bg-white p-4 shadow-sm">
                <dt className="font-medium text-slate-900">{SECTIONS[key].title}</dt>
                <dd className="mt-1 text-sm text-slate-600">{SECTIONS[key].description}</dd>
              </div>
            ))}
          </dl>
        </section>

      </div>
    </div>
  );
}
