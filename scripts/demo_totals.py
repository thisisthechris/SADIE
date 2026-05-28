"""Demo prep totals."""
from events.models import Event
from analytics.models import UserHashInteraction, PostcodeAreaInteraction
from organisations.models import Organisation, Location
from scraping.models import ScrapeSource

print(f"Events:                {Event.objects.count()}")
print(f"UserHashInteractions:  {UserHashInteraction.objects.count()}")
print(f"PostcodeInteractions:  {PostcodeAreaInteraction.objects.count()}")
print(f"Organisations:         {Organisation.objects.count()}")
print(f"Locations:             {Location.objects.count()}")
print()
print("Scrape sources (last run):")
for s in ScrapeSource.objects.all().order_by("name"):
    print(f"  {s.name:35s}  last_run={s.last_scraped_at}")
