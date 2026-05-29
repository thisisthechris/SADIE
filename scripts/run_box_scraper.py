"""One-off helper: re-run The Box scraper after fix."""

from scraping.models import ScrapeSource
from scraping.tasks import scrape_the_box

src = ScrapeSource.objects.get(name="The Box Plymouth")
print(f"--- Re-running The Box (id={src.id}) ---", flush=True)
try:
    scrape_the_box(src.id)
    print("OK", flush=True)
except Exception as exc:  # noqa: BLE001
    print(f"FAIL: {exc!r}", flush=True)
