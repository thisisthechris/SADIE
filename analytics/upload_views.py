from django.conf import settings
from django.utils.crypto import constant_time_compare
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from .serializers import (
    PostcodeAreaInteractionUploadSerializer,
    UserHashInteractionUploadSerializer,
)


class UploadRateThrottle(SimpleRateThrottle):
    """Separate throttle scope for upload endpoints (200 requests/hour per IP)."""

    scope = "upload"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class UploadTokenPermission(BasePermission):
    """Simple shared-secret permission for upload endpoints."""

    def has_permission(self, request, view):
        token = request.headers.get("X-Upload-Token")
        return token is not None and constant_time_compare(token, settings.UPLOAD_API_TOKEN)


class UserHashInteractionUploadView(APIView):
    """
    POST /api/upload/interactions/
    Accepts a list of user-hash interaction records (no personal data).

    Headers:
        X-Upload-Token: <UPLOAD_API_TOKEN>

    Body (JSON):
        [{"user_hash": "abc123...", "interaction_type": "event",
          "organisation": 1, "event": 5, "interaction_date": "2024-01-15"}, ...]
    """

    permission_classes = [UploadTokenPermission]
    throttle_classes = [UploadRateThrottle]

    def post(self, request, *args, **kwargs):
        data = request.data
        if not isinstance(data, list):
            data = [data]
        serializer = UserHashInteractionUploadSerializer(data=data, many=True)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {"created": len(serializer.data)},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PostcodeAreaInteractionUploadView(APIView):
    """
    POST /api/upload/postcodes/
    Accepts a list of postcode-area interaction summary records.

    Headers:
        X-Upload-Token: <UPLOAD_API_TOKEN>

    Body (JSON):
        [{"organisation": 1, "postcode": "EC1A", "area": "Islington",
          "interaction_count": 42, "period_start": "2024-01-01",
          "period_end": "2024-01-31"}, ...]
    """

    permission_classes = [UploadTokenPermission]
    throttle_classes = [UploadRateThrottle]

    def post(self, request, *args, **kwargs):
        data = request.data
        if not isinstance(data, list):
            data = [data]
        serializer = PostcodeAreaInteractionUploadSerializer(data=data, many=True)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {"created": len(serializer.data)},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
