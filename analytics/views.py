import django_filters
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from .models import PostcodeAreaInteraction, UserHashInteraction
from .serializers import (
    PostcodeAreaInteractionSerializer,
    UserHashInteractionSerializer,
)


class UserHashInteractionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="interaction_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="interaction_date", lookup_expr="lte")

    class Meta:
        model = UserHashInteraction
        fields = ["organisation", "interaction_type", "user_hash", "date_from", "date_to"]


class PostcodeInteractionFilter(django_filters.FilterSet):
    period_from = django_filters.DateFilter(field_name="period_start", lookup_expr="gte")
    period_to = django_filters.DateFilter(field_name="period_end", lookup_expr="lte")

    class Meta:
        model = PostcodeAreaInteraction
        fields = ["organisation", "postcode", "area", "period_from", "period_to"]


class UserHashInteractionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UserHashInteraction.objects.select_related("organisation", "event", "location").all()
    serializer_class = UserHashInteractionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_class = UserHashInteractionFilter
    search_fields = ["user_hash", "organisation__name"]
    ordering_fields = ["interaction_date", "created_at"]


class PostcodeAreaInteractionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PostcodeAreaInteraction.objects.select_related("organisation").all()
    serializer_class = PostcodeAreaInteractionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_class = PostcodeInteractionFilter
    search_fields = ["postcode", "area", "organisation__name"]
    ordering_fields = ["period_end", "interaction_count"]
