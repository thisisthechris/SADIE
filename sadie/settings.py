import os
from pathlib import Path

import dj_database_url
from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent

# Compute DEBUG first so all subsequent validation can reference it directly
DEBUG = os.environ.get("DEBUG", "True") == "True"

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ValueError("SECRET_KEY environment variable must be set in production.")
    SECRET_KEY = "django-insecure-dev-key-change-in-production"

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "*" if DEBUG else "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "corsheaders",
    "rest_framework",
    "rest_framework_gis",
    "django_filters",
    "leaflet",
    "django_celery_beat",
    "organisations",
    "events",
    "analytics",
    "dashboard",
    "scraping",
    "embeddings",
    "imports",
    "anymail",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
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

# Database – parsed from DATABASE_URL env var via dj-database-url
DATABASES = {
    "default": dj_database_url.config(
        default="postgis://sadie:sadie_password@db:5432/sadie",
        conn_max_age=600,
    )
}
# Force the PostGIS backend regardless of DATABASE_URL's scheme. dj-database-url
# only selects django.contrib.gis.db.backends.postgis for a "postgis://" URL,
# but managed Postgres providers (e.g. Render) only ever hand out a plain
# "postgres://" URL. The app always needs GIS support, so pin the engine here
# rather than relying on callers to rewrite the URL scheme.
DATABASES["default"]["ENGINE"] = "django.contrib.gis.db.backends.postgis"

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
# Django serves only its own collected static (admin, DRF, leaflet widgets) via
# WhiteNoise. The React SPA and its assets are built and served separately by
# the nginx front-door container.
MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", BASE_DIR / "mediafiles")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Authentication redirects
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

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
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "1000/day",
        "upload": "200/hour",
    },
    "DEFAULT_PAGINATION_CLASS": "sadie.pagination.StandardPagination",
    "PAGE_SIZE": 50,
}

# Celery
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULE = {
    # Scrape all enabled sources for new events at 2:00 AM daily.
    # Administrators can also manage schedules via Django Admin (django-celery-beat).
    "scrape-all-sources-daily": {
        "task": "scraping.tasks.scrape_all_sources",
        "schedule": crontab(hour=2, minute=0),
    },
    # Generate synthetic analytics data daily at 3:00 AM (after scraping).
    # NOTE: Currently enabled in production for testing purposes.
    "generate-synthetic-analytics-daily": {
        "task": "organisations.tasks.generate_daily_synthetic_analytics",
        "schedule": crontab(hour=3, minute=0),
    },
}

# Upload API token (simple shared-secret for upload endpoints)
UPLOAD_API_TOKEN = os.environ.get("UPLOAD_API_TOKEN", "")
if not UPLOAD_API_TOKEN:
    if not DEBUG:
        raise ValueError("UPLOAD_API_TOKEN environment variable must be set in production.")
    UPLOAD_API_TOKEN = "dev-upload-token"

# Secret salt/pepper for hashing PII (e.g. partner CSV import emails) into
# user_hash values. Never log or store the raw identifier once hashed — see
# imports/hashing.py.
PII_HASH_SALT = os.environ.get("PII_HASH_SALT", "")
if not PII_HASH_SALT:
    if not DEBUG:
        raise ValueError("PII_HASH_SALT environment variable must be set in production.")
    PII_HASH_SALT = "dev-pii-hash-salt"

# CORS – allow browser-based integrations to POST to upload endpoints.
# Populate CORS_ALLOWED_ORIGINS (comma-separated) via env var in production.
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
CORS_URLS_REGEX = r"^/api/upload/.*$"

# CSRF trusted origins – required for Django 4.x when the app is served over
# HTTPS via a reverse proxy (Traefik, Nginx Proxy Manager, etc.).
# Set to a comma-separated list of origins, e.g. https://yourdomain.com
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()]

# MapTiler key surfaced to the SPA at runtime via /api/config/.
# Never bake this into the JS bundle so it can be rotated without a rebuild.
MAPTILER_API_KEY = os.environ.get("MAPTILER_API_KEY", "")

# Email (Mailgun via django-anymail). Falls back to Django's console backend
# (prints emails to stdout) whenever MAILGUN_API_KEY is unset, so local dev
# and CI never need real Mailgun credentials.
MAILGUN_API_KEY = os.environ.get("MAILGUN_API_KEY", "")
MAILGUN_SENDER_DOMAIN = os.environ.get("MAILGUN_SENDER_DOMAIN", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "SADIE <no-reply@example.com>")

if MAILGUN_API_KEY:
    EMAIL_BACKEND = "anymail.backends.mailgun.EmailBackend"
    ANYMAIL = {
        "MAILGUN_API_KEY": MAILGUN_API_KEY,
        "MAILGUN_SENDER_DOMAIN": MAILGUN_SENDER_DOMAIN,
    }
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Embeddings (Phase 2 search). fastembed loads the ONNX model lazily.
EMBEDDING_PROVIDER = os.environ.get("EMBEDDING_PROVIDER", "fastembed")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "384"))

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

# GDAL / GEOS library paths – only set when explicitly provided via env vars;
# omitting them lets Django auto-detect the installed system libraries.
_gdal_path = os.environ.get("GDAL_LIBRARY_PATH", "")
_geos_path = os.environ.get("GEOS_LIBRARY_PATH", "")
if _gdal_path:
    GDAL_LIBRARY_PATH = _gdal_path
if _geos_path:
    GEOS_LIBRARY_PATH = _geos_path

# Production security settings (disabled in development)
if not DEBUG:
    # Trust the X-Forwarded-Proto header set by reverse proxies (Traefik, NPM).
    # This lets Django correctly detect HTTPS without SECURE_SSL_REDIRECT,
    # which would cause infinite redirect loops when the proxy terminates TLS.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # Do not redirect to HTTPS at the Django layer — the reverse proxy handles it.
    # Re-enable SECURE_SSL_REDIRECT = True only if exposing gunicorn directly
    # without a TLS-terminating proxy in front of it.
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "WARNING",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "celery": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "events.tasks": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "scraping": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "analytics": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
