from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default pagination that lets clients opt into a larger page size."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500
