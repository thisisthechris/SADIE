from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import SavedView
from .serializers import SavedViewSerializer


class SavedViewPermission(permissions.BasePermission):
    """Owner can do anything; others can only read public views."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return obj.is_public or (request.user.is_authenticated and obj.user_id == request.user.id)
        return request.user.is_authenticated and obj.user_id == request.user.id


class SavedViewViewSet(viewsets.ModelViewSet):
    serializer_class = SavedViewSerializer
    permission_classes = [SavedViewPermission]
    lookup_field = "slug"

    def get_queryset(self):
        u = self.request.user
        qs = SavedView.objects.all().select_related("user")
        if u.is_authenticated:
            return qs.filter(Q(user=u) | Q(is_public=True))
        return qs.filter(is_public=True)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(user=self.request.user)
        except IntegrityError:
            raise ValidationError({"name": "You already have a saved view with this name."})

    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        if not request.user.is_authenticated:
            return Response({"results": []})
        qs = SavedView.objects.filter(user=request.user)
        return Response({"results": SavedViewSerializer(qs, many=True, context={"request": request}).data})


def short_link(request, slug: str):
    """Public short-link redirect: /v/<slug>/ → SPA resolver page."""
    view = get_object_or_404(SavedView, slug=slug)
    if not view.is_public and not (request.user.is_authenticated and view.user_id == request.user.id):
        return redirect("/login/?next=/v/%s/" % slug)
    return redirect(f"/app/v/{slug}/")
