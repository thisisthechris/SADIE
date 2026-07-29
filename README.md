# SADIE

SADIE is a Django-based analytics platform for arts organisations — tracking events, geolocated venues, anonymous user journeys (email hash, no PII), and postcode interaction summaries.

## Local Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) (recommended path)
- **Or** Python 3.11+, PostgreSQL with PostGIS, and Redis (for a manual setup)

---

### Option 1: Docker Compose (recommended)

This is the easiest way to get a fully working stack (PostgreSQL/PostGIS, Redis, Celery, and the Django web server) running locally.

**1. Clone the repository**

```bash
git clone https://github.com/thisisthechris/SADIE.git
cd SADIE
```

**2. Create your local environment file**

```bash
cp .env.example .env
```

Open `.env` and update the values as needed. For local development, set `DEBUG=True` and use any value for `SECRET_KEY` and `UPLOAD_API_TOKEN`:

```dotenv
SECRET_KEY=any-local-dev-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgis://sadie:sadie_password@db:5432/sadie
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
UPLOAD_API_TOKEN=any-local-dev-token
```

**3. Build and start all services**

```bash
docker compose up --build
```

This will:
- Start a PostGIS database and Redis instance
- Run `python manage.py migrate` automatically
- Start the Django web server on [http://localhost:8000](http://localhost:8000)
- Start Celery worker and Celery Beat scheduler

**4. (Optional) Create a superuser for Django Admin**

In a separate terminal:

```bash
docker compose exec web python manage.py createsuperuser
```

**5. (Optional) Load synthetic development data**

```bash
docker compose exec web python manage.py generate_synthetic_data
```

This populates the database with realistic UK organisations, locations, events, and interactions for development and exploration.

---

### Option 2: Manual setup (without Docker)

Use this approach if you prefer to manage dependencies yourself.

**1. Install system dependencies**

GDAL, GEOS, and PostGIS are required. On Ubuntu/Debian:

```bash
sudo apt-get install -y libgdal-dev gdal-bin libgeos-dev libproj-dev python3-gdal binutils postgresql postgresql-contrib postgis
```

On macOS with Homebrew:

```bash
brew install gdal geos proj postgresql postgis
```

**2. Clone the repository and set up a virtual environment**

```bash
git clone https://github.com/thisisthechris/SADIE.git
cd SADIE
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**3. Create a PostGIS database**

```bash
createdb sadie
psql sadie -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

**4. Create your environment file**

```bash
cp .env.example .env
```

Edit `.env` to point at your local database and Redis:

```dotenv
SECRET_KEY=any-local-dev-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgis://localhost/sadie
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
UPLOAD_API_TOKEN=any-local-dev-token
```

**5. Apply migrations and start the development server**

```bash
python manage.py migrate
python manage.py runserver
```

The dashboard is available at [http://localhost:8000](http://localhost:8000).

**6. (Optional) Start Celery worker and Beat scheduler**

In separate terminals:

```bash
celery -A sadie worker --loglevel=info
celery -A sadie beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

**7. (Optional) Load synthetic development data**

```bash
python manage.py generate_synthetic_data
```

---

## Deploying to Render

`render.yaml` (repo root) is a [Render Blueprint](https://render.com/docs/blueprint-spec) that deploys a full, standalone instance of SADIE — including the partner CSV test dataset — to [Render](https://render.com). It's entirely independent of the Docker Compose / Portainer / GHCR deployment above; neither setup depends on or affects the other.

**What it provisions** (Frankfurt region, paid Starter-tier throughout, ~$51/mo — see cost breakdown in the Blueprint's comments): a Postgres database, a Key Value (Redis) instance for Celery, a Docker web service running Django/gunicorn (with a 5GB persistent disk for uploaded media), two Docker background workers (Celery worker + beat), and a Static Site serving the built React SPA — which replaces nginx's job of reverse-proxying `/api/`, `/accounts/`, etc. via rewrite rules instead.

**Deploy:**

1. In the [Render Dashboard](https://dashboard.render.com), click *New → Blueprint* and connect this GitHub repo.
2. Render detects `render.yaml` and lists the services it will create. You'll be prompted for a handful of secret values (`sync: false` in the Blueprint): `MAILGUN_API_KEY`, `MAILGUN_SENDER_DOMAIN`, `DEFAULT_FROM_EMAIL`, `DJANGO_SUPERUSER_USERNAME`/`_EMAIL`/`_PASSWORD`, and optionally `MAPTILER_API_KEY`.
3. Click *Deploy Blueprint*. The web service's `initialDeployHook` automatically creates the superuser and runs `render_seed` (which waits for the Celery broker to come up, then imports + geocodes the partner CSV test data) on its first successful deploy — no manual shell/CLI access needed. `enable_postgis` (in `preDeployCommand`) similarly retries for a while if the database isn't accepting connections yet on the very first deploy attempt.
4. If the very first deploy still fails (e.g. the database took longer than the retry window to come up), just trigger *Manual Deploy → Deploy latest commit* on `sadie-web` from the Dashboard — `enable_postgis`/`migrate` and the seed step are all safe to re-run.
5. **One manual follow-up step:** the `sadie-web` service's rewrite destinations in `render.yaml` assume its hostname is exactly `sadie-web.onrender.com`. If that name was already taken by another Render user, Render will have appended a random suffix — check the real hostname on `sadie-web`'s page in the Dashboard, and if it differs, open `sadie-frontend → Redirects/Rewrites` and correct the destination URLs there directly (faster than editing `render.yaml` and re-syncing).
6. Once all six resources show *Live*/*Available*, visit `sadie-frontend`'s URL, log in with the superuser credentials from step 2, and confirm the seeded test data (organisations, events, geocoded venues) appears.

The [Render CLI](https://render.com/docs/cli) isn't required for any of this — it's only useful afterwards for tailing logs or validating `render.yaml` locally (`render blueprints validate render.yaml`).

---

## API Endpoints

| Endpoint | Method | Auth required | Description |
|---|---|---|---|
| `/api/organisations/` | GET | No | List organisations |
| `/api/events/` | GET | No | List events |
| `/api/analytics/` | GET | No | List analytics records |
| `/api/upload/interactions/` | POST | `X-Upload-Token` header | Upload user hash interactions |
| `/api/upload/postcodes/` | POST | `X-Upload-Token` header | Upload postcode area interactions |

The upload token is the value of `UPLOAD_API_TOKEN` in your `.env` file.

---

## Dashboard

| URL | Description |
|---|---|
| `/` | Overview dashboard |
| `/map/` | Geolocated venue map |
| `/calendar/` | Event calendar |
| `/journeys/` | User journey analytics |
| `/postcodes/` | Postcode interaction heatmap |
| `/admin/` | Django Admin |