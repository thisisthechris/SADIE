import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Search from "./pages/Search";
import MapPage from "./pages/Map";
import CalendarPage from "./pages/Calendar";
import OrganisationsPage from "./pages/Organisations";
import OrganisationDetailPage from "./pages/OrganisationDetail";
import Postcodes from "./pages/Postcodes";
import { useMe } from "./lib/auth";
const Map3D = lazy(() => import("./pages/Map3D"));
const Postcodes3D = lazy(() => import("./pages/Postcodes3D"));
const Network = lazy(() => import("./pages/Network"));
const TimeCube = lazy(() => import("./pages/TimeCube"));
const SavedViews = lazy(() => import("./pages/SavedViews"));
const ViewResolver = lazy(() => import("./pages/ViewResolver"));
const Imports = lazy(() => import("./pages/Imports"));
const Journeys = lazy(() => import("./pages/Journeys"));
const VizFallback = (_jsx("div", { className: "card p-6 text-sm text-muted", children: "Loading 3D viewer\u2026" }));
function RequireAuth({ children }) {
    const { data, isLoading } = useMe();
    if (isLoading)
        return null;
    if (!data)
        return _jsx(Navigate, { to: "/login", replace: true });
    return children;
}
export default function App() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsxs(Route, { path: "/", element: _jsx(RequireAuth, { children: _jsx(Layout, {}) }), children: [_jsx(Route, { index: true, element: _jsx(Home, {}) }), _jsx(Route, { path: "search", element: _jsx(Search, {}) }), _jsx(Route, { path: "map", element: _jsx(MapPage, {}) }), _jsx(Route, { path: "calendar", element: _jsx(CalendarPage, {}) }), _jsx(Route, { path: "organisations", element: _jsx(OrganisationsPage, {}) }), _jsx(Route, { path: "organisations/:slug", element: _jsx(OrganisationDetailPage, {}) }), _jsx(Route, { path: "postcodes", element: _jsx(Postcodes, {}) }), _jsx(Route, { path: "map3d", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(Map3D, {}) }) }), _jsx(Route, { path: "postcodes3d", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(Postcodes3D, {}) }) }), _jsx(Route, { path: "network", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(Network, {}) }) }), _jsx(Route, { path: "timecube", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(TimeCube, {}) }) }), _jsx(Route, { path: "views", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(SavedViews, {}) }) }), _jsx(Route, { path: "v/:slug", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(ViewResolver, {}) }) }), _jsx(Route, { path: "imports", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(Imports, {}) }) }), _jsx(Route, { path: "journeys", element: _jsx(Suspense, { fallback: VizFallback, children: _jsx(Journeys, {}) }) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }));
}
