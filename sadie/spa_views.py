"""Serve the built Vite SPA at /app/* with a graceful dev fallback, plus landing page."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import redirect
from django.views.decorators.cache import cache_control

_SPA_INDEX = Path(settings.BASE_DIR) / "frontend" / "dist" / "index.html"

_DEV_FALLBACK = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SADIE SPA</title>
<style>body{font:14px/1.5 system-ui;margin:3rem auto;max-width:42rem;color:#0f172a}
code{background:#f1f5f9;padding:.1rem .3rem;border-radius:3px}</style></head>
<body>
<h1>SADIE SPA not built yet</h1>
<p>The Vite bundle at <code>frontend/dist/index.html</code> was not found.</p>
<p>For development, run the Vite dev server and open it directly:</p>
<pre><code>cd frontend &amp;&amp; npm install &amp;&amp; npm run dev
# then open http://localhost:5173/app/</code></pre>
<p>For production builds, run <code>npm run build</code> in <code>frontend/</code>
(or rebuild the Docker image &mdash; the multi-stage build handles this
automatically) and refresh.</p>
</body></html>
"""


def spa_view(request):
    """Return the built SPA shell, or a friendly placeholder in dev.
    
    Cache-control header ensures the HTML is never cached so new asset hashes
    are always picked up. Static assets (CSS/JS with content hashes) are cached.
    """
    if _SPA_INDEX.exists():
        # Read on every request so a fresh `npm run build` is picked up
        # without restarting the Django process. The file is small.
        response = HttpResponse(_SPA_INDEX.read_bytes(), content_type="text/html")
        # Ensure HTML is never cached — only the hashed assets are cacheable
        response["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response["Pragma"] = "no-cache"
        response["Expires"] = "0"
        return response
    return HttpResponse(_DEV_FALLBACK, content_type="text/html", status=200)


def landing_view(request):
    """Landing page — redirect to the React app."""
    return redirect("spa-root")
