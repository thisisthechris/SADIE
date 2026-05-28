"""One-off demo helper: run all scrapers synchronously."""
from scraping.models import ScrapeSource
from scraping.tasks import (
    scrape_plymouth_culture,
    scrape_theatre_royal,
    scrape_the_box,
)

MAPPING = {
    "Plymouth Culture": scrape_plymouth_culture,
    "Theatre Royal Plymouth": scrape_theatre_royal,
    "The Box Plymouth": scrape_the_box,
}

for name, fn in MAPPING.items():
    src = ScrapeSource.objects.get(name=name)
    print(f"--- Running {name} (id={src.id}) ---", flush=True)
    try:
        result = fn(src.id)
        print(f"OK: {result}", flush=True)
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL {name}: {exc!r}", flush=True)
