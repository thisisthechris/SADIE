import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    if os.environ.get("DEBUG", "True") != "True":
        raise ValueError("SECRET_KEY environment variable must be set in production.")
    SECRET_KEY = "django-insecure-dev-key-change-in-production"

DEBUG = os.environ.get("DEBUG", "True") == "True"

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "rest_framework",
    "rest_framework_gis",
    "django_filters",
    "leaflet",
    "django_celery_beat",
    "organisations",
    "events",
    "analytics",
    "dashboard",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sadie.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "sadie.wsgi.application"

# Database
_db_url = os.environ.get("DATABASE_URL", "postgis://sadie:sadie_password@db:5432/sadie")
# Parse DATABASE_URL manually to avoid dj-database-url dependency
def _parse_db_url(url):
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username,
        "PASSWORD": parsed.password,
        "HOST": parsed.hostname,
        "PORT": str(parsed.port or 5432),
    }

DATABASES = {"default": _parse_db_url(_db_url)}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Europe/London"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("STATIC_ROOT", BASE_DIR / "staticfiles")
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", BASE_DIR / "mediafiles")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

# Celery
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# Upload API token (simple shared-secret for upload endpoints)
UPLOAD_API_TOKEN = os.environ.get("UPLOAD_API_TOKEN", "")
if not UPLOAD_API_TOKEN:
    if os.environ.get("DEBUG", "True") != "True":
        raise ValueError("UPLOAD_API_TOKEN environment variable must be set in production.")
    UPLOAD_API_TOKEN = "dev-upload-token"

# Leaflet / GeoDjango map defaults (centred on UK)
LEAFLET_CONFIG = {
    "DEFAULT_CENTER": (54.0, -2.0),
    "DEFAULT_ZOOM": 6,
    "MIN_ZOOM": 3,
    "MAX_ZOOM": 18,
    "TILES": [
        (
            "OpenStreetMap",
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {"attribution": "&copy; OpenStreetMap contributors"},
        )
    ],
}

# GDAL / GEOS paths (set if auto-detection fails inside Docker)
GDAL_LIBRARY_PATH = os.environ.get("GDAL_LIBRARY_PATH", "")
GEOS_LIBRARY_PATH = os.environ.get("GEOS_LIBRARY_PATH", "")
if not GDAL_LIBRARY_PATH:
    del GDAL_LIBRARY_PATH  # let Django auto-detect
if not GEOS_LIBRARY_PATH:
    del GEOS_LIBRARY_PATH
