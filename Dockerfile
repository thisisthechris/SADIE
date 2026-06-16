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

# Collect Django's own static (admin, DRF browsable API, leaflet widgets) so
# WhiteNoise can serve them under /static/. The React SPA is built and served
# separately by the nginx front-door container, not by Django.
RUN python manage.py collectstatic --noinput --verbosity=2

EXPOSE 8000

CMD ["gunicorn", "sadie.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
