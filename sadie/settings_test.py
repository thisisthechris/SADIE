"""
Test settings: uses plain SQLite so tests can run without GDAL/PostGIS.
GIS-specific fields fall back to plain fields when GDAL is unavailable.
"""

from .settings import *  # noqa: F401, F403

DEBUG = True  # explicitly set so validation logic in settings.py is unambiguous

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Remove apps that require GDAL/PostGIS or Leaflet
INSTALLED_APPS = [
    app
    for app in INSTALLED_APPS  # noqa: F405
    if app not in ("django.contrib.gis", "rest_framework_gis", "leaflet")
]
