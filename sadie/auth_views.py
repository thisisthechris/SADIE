"""
Auth and runtime-config endpoints for the SPA.

The SPA is served same-origin from Django at ``/app/*`` so we use plain
session cookies + CSRF (no JWT, no separate identity provider).

Endpoints:

    GET  /api/config/        public runtime config (e.g. MapTiler key)
    GET  /api/auth/me/       current user (200 with payload, or 401)
    POST /api/auth/login/    username + password -> session cookie
    POST /api/auth/logout/   destroy the session
    GET  /api/auth/csrf/     issue a CSRF cookie (for SPA bootstrap)
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response


def _user_payload(user):
    member_orgs = []
    try:
        member_orgs = [
            {"id": o.id, "slug": o.slug, "name": o.name, "is_partner": o.is_partner}
            for o in user.member_organisations.all().only("id", "slug", "name", "is_partner")
        ]
    except Exception:
        member_orgs = []
    return {
        "id": user.pk,
        "username": user.username,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "member_organisations": member_orgs,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def config(request: Request) -> Response:
    """Public runtime config consumed by the SPA on bootstrap."""
    return Response(
        {
            "maptiler_api_key": getattr(settings, "MAPTILER_API_KEY", ""),
            "default_map_center": [-4.142656, 50.371319],  # Plymouth
            "default_map_zoom": 11,
        }
    )


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    """Issue a CSRF cookie. Call this before the first POST from the SPA."""
    return Response({"csrfToken": get_token(request)})


@api_view(["GET"])
@permission_classes([AllowAny])
def me(request: Request) -> Response:
    """Return the current user, or 401 if anonymous."""
    if request.user.is_authenticated:
        return Response(_user_payload(request.user))
    return Response({"detail": "Not authenticated."}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request: Request) -> Response:
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        return Response(
            {"detail": "username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    login(request, user)
    return Response(_user_payload(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    logout(request)
    return Response({"detail": "ok"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def users_search(request: Request) -> Response:
    """Staff-only autocomplete for org member picker. ``?search=<q>`` -> up to 20 users."""
    if not request.user.is_staff:
        return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
    from django.contrib.auth import get_user_model
    from django.db.models import Q

    q = (request.query_params.get("search") or "").strip()
    User = get_user_model()
    qs = User.objects.all()
    if q:
        qs = qs.filter(
            Q(username__icontains=q)
            | Q(email__icontains=q)
            | Q(first_name__icontains=q)
            | Q(last_name__icontains=q)
        )
    qs = qs.order_by("username")[:20]
    return Response(
        {
            "results": [
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "first_name": u.first_name,
                    "last_name": u.last_name,
                }
                for u in qs
            ]
        }
    )
