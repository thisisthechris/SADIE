import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api } from "../lib/api";
import { useFilters } from "../lib/filters";
import FilterBar from "../components/FilterBar";
const PALETTE = [
    0x60a5fa, 0xfbbf24, 0xa78bfa, 0x34d399, 0xf472b6, 0xfb7185,
    0x22d3ee, 0xfacc15, 0xc084fc, 0x4ade80, 0xf87171, 0x38bdf8,
];
/**
 * Time-Space Cube: X = longitude, Y = days from earliest event, Z = latitude.
 * Each event becomes an instanced sphere coloured by primary category.
 */
export default function TimeCube() {
    const f = useFilters();
    const containerRef = useRef(null);
    const reduceMotion = useMemo(() => typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
    const q = useQuery({
        queryKey: ["viz-spatiotemporal", f.asQuery()],
        queryFn: () => api("/api/analytics/viz/spatiotemporal/", { query: f.asQuery() }),
    });
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !q.data)
            return;
        const width = el.clientWidth;
        const height = el.clientHeight;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0d10);
        scene.fog = new THREE.Fog(0x0b0d10, 200, 1200);
        const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 5000);
        camera.position.set(220, 240, 320);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        el.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 80, 0);
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(200, 400, 200);
        scene.add(dir);
        // Reference grid (XZ plane).
        const grid = new THREE.GridHelper(400, 20, 0x334155, 0x1f2937);
        scene.add(grid);
        // Axis lines: X (lng) red, Y (time) green, Z (lat) blue.
        const axes = new THREE.AxesHelper(180);
        scene.add(axes);
        // Project lng/lat to scene units (centred on Plymouth).
        const PLY = { lng: -4.142, lat: 50.371 };
        const SCALE_LNG = 4000; // ~1° lng ≈ 70km here → 4000 units
        const SCALE_LAT = 4000;
        const SCALE_T = 1.2; // 1 day ≈ 1.2 units
        const project = (r) => ({
            x: (r.lng - PLY.lng) * SCALE_LNG,
            y: r.t * SCALE_T,
            z: -(r.lat - PLY.lat) * SCALE_LAT,
        });
        // Group categories → palette index.
        const catIndex = new Map();
        q.data.categories.forEach((c, i) => catIndex.set(c.id, i % PALETTE.length));
        const geom = new THREE.SphereGeometry(2.4, 12, 10);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const inst = new THREE.InstancedMesh(geom, mat, q.data.results.length);
        const dummy = new THREE.Object3D();
        const colour = new THREE.Color();
        q.data.results.forEach((r, i) => {
            const p = project(r);
            dummy.position.set(p.x, p.y, p.z);
            dummy.updateMatrix();
            inst.setMatrixAt(i, dummy.matrix);
            colour.setHex(PALETTE[catIndex.get(r.cat) ?? 0]);
            inst.setColorAt(i, colour);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor)
            inst.instanceColor.needsUpdate = true;
        scene.add(inst);
        let raf = 0;
        const tick = () => {
            controls.update();
            renderer.render(scene, camera);
            if (!reduceMotion)
                raf = requestAnimationFrame(tick);
        };
        tick();
        if (reduceMotion)
            renderer.render(scene, camera);
        const onResize = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(raf);
            controls.dispose();
            geom.dispose();
            mat.dispose();
            renderer.dispose();
            el.removeChild(renderer.domElement);
        };
    }, [q.data, reduceMotion]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Time\u2013Space Cube" }), _jsx("p", { className: "text-sm text-muted", children: "Each sphere is an event positioned by longitude (X), days from the earliest event in view (Y), and latitude (Z). Colour encodes category. Drag to rotate, scroll to zoom." })] }), _jsx(FilterBar, {}), _jsx("div", { className: "card overflow-hidden", style: { height: "70vh" }, children: _jsx("div", { ref: containerRef, style: { width: "100%", height: "100%" } }) }), q.data && (_jsxs("div", { className: "text-xs text-muted flex flex-wrap gap-3 items-center", children: [_jsxs("span", { children: [q.data.count, " events plotted"] }), q.data.earliest && _jsxs("span", { children: ["\u00B7 earliest: ", q.data.earliest.slice(0, 10)] }), _jsx("span", { className: "ml-auto flex flex-wrap gap-2", children: q.data.categories.slice(0, 8).map((c, i) => (_jsxs("span", { className: "inline-flex items-center gap-1", children: [_jsx("span", { className: "inline-block w-3 h-3 rounded-full", style: { background: `#${PALETTE[i % PALETTE.length].toString(16).padStart(6, "0")}` } }), c.name] }, c.id))) })] }))] }));
}
