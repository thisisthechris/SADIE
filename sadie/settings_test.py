"""
Test settings: uses plain SQLite so tests can run without GDAL/PostGIS.
GIS-specific fields are replaced by regular fields via a test-safe DB backend.
"""
from .settings import *  # noqa: F401, F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Replace PostGIS-dependent app with a GIS-free contrib stub
INSTALLED_APPS = [
    app for app in INSTALLED_APPS  # noqa: F405
    if app not in ("django.contrib.gis", "rest_framework_gis", "leaflet")
]

# Suppress GDAL/GEOS auto-detection failures
import os
os.environ.pop("GDAL_LIBRARY_PATH", None)
os.environ.pop("GEOS_LIBRARY_PATH", None)
