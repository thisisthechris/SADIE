from django.test import SimpleTestCase

from analytics.geocoding import normalize_postcode, postcode_sector


class NormalizePostcodeTests(SimpleTestCase):
    def test_unspaced_six_char_postcode_gets_space(self):
        self.assertEqual(normalize_postcode("PL40AB"), "PL4 0AB")
        self.assertEqual(normalize_postcode("pl45ab"), "PL4 5AB")

    def test_unspaced_seven_char_postcode_gets_space(self):
        self.assertEqual(normalize_postcode("PL114AP"), "PL11 4AP")


class PostcodeSectorTests(SimpleTestCase):
    def test_full_postcode_reduces_to_sector(self):
        self.assertEqual(postcode_sector("PL4 5AB"), "PL4 5")

    def test_unspaced_postcode_is_normalised_then_reduced(self):
        self.assertEqual(postcode_sector("pl45ab"), "PL4 5")

    def test_existing_sector_is_unchanged(self):
        self.assertEqual(postcode_sector("PL4 5"), "PL4 5")

    def test_outward_only_is_unchanged(self):
        self.assertEqual(postcode_sector("PL4"), "PL4")

    def test_empty_input_returns_empty(self):
        self.assertEqual(postcode_sector(""), "")
