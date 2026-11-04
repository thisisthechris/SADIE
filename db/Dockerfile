# Postgres 15 + PostGIS 3 + pgvector, installed from the PGDG apt repo that
# the official postgres image already configures. Stay on major version 15
# until the production volume is migrated (a major bump needs dump/restore).
FROM postgres:15-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-15-postgis-3 \
        postgresql-15-postgis-3-scripts \
        postgresql-15-pgvector \
    && rm -rf /var/lib/apt/lists/*
