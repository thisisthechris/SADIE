import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "./components/Layout";
import { OrgInsights } from "./pages/OrgInsights";
import Home from "./pages/Home";
import Login from "./pages/Login";
import MapPage from "./pages/Map";
import CalendarPage from "./pages/Calendar";
import OrganisationsPage from "./pages/Organisations";
import OrganisationDetailPage from "./pages/OrganisationDetail";
import Postcodes from "./pages/Postcodes";
import { useMe } from "./lib/auth";

const EventDetail = lazy(() => import("./pages/EventDetail"));
const Network = lazy(() => import("./pages/Network"));
const TimeCube = lazy(() => import("./pages/TimeCube"));
const SavedViews = lazy(() => import("./pages/SavedViews"));
const ViewResolver = lazy(() => import("./pages/ViewResolver"));
const Imports = lazy(() => import("./pages/Imports"));
const Journeys = lazy(() => import("./pages/Journeys"));

const VizFallback = (
  <div className="card p-6 text-sm text-muted">Loading 3D viewer…</div>
);

function RequireAuth({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useMe();
  if (isLoading) return null;
  if (!data) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OrgInsights />} />
        <Route path="overview" element={<Home />} />
        <Route
          path="events/:id"
          element={<Suspense fallback={VizFallback}><EventDetail /></Suspense>}
        />
        <Route path="map" element={<MapPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="organisations" element={<OrganisationsPage />} />
        <Route path="organisations/:slug" element={<OrganisationDetailPage />} />
        <Route path="postcodes" element={<Postcodes />} />
        <Route path="map3d" element={<Navigate to="/map" replace />} />
        <Route path="postcodes3d" element={<Navigate to="/postcodes" replace />} />
        <Route
          path="network"
          element={<Suspense fallback={VizFallback}><Network /></Suspense>}
        />
        <Route
          path="timecube"
          element={<Suspense fallback={VizFallback}><TimeCube /></Suspense>}
        />
        <Route
          path="views"
          element={<Suspense fallback={VizFallback}><SavedViews /></Suspense>}
        />
        <Route
          path="v/:slug"
          element={<Suspense fallback={VizFallback}><ViewResolver /></Suspense>}
        />
        <Route
          path="imports"
          element={<Suspense fallback={VizFallback}><Imports /></Suspense>}
        />
        <Route
          path="journeys"
          element={<Suspense fallback={VizFallback}><Journeys /></Suspense>}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
