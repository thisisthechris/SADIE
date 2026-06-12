FROM node:20-alpine AS frontend
WORKDIR /frontend
# Raise the Node.js heap limit so vite + source-map generation doesn't OOM
# on memory-constrained CI runners (the default ~1.5 GB is too small for this bundle).
ENV NODE_OPTIONS=--max-old-space-size=4096
# Put local .bin on PATH so tsc / vite can be called directly in RUN steps.
ENV PATH=/frontend/node_modules/.bin:$PATH
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# Split into two layers: if tsc fails you see TypeScript errors; if vite fails you see vite errors.
RUN tsc -b
RUN vite build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    libgdal-dev \
    gdal-bin \
    libgeos-dev \
    libproj-dev \
    python3-gdal \
    binutils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pull the SPA build output in so Django can serve it under /app/* and /static/spa/.
COPY --from=frontend /frontend/dist ./frontend/dist

RUN python manage.py collectstatic --noinput --verbosity=2

EXPOSE 8000

CMD ["gunicorn", "sadie.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
