from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsOrgEditor(BasePermission):
    """Read for anyone; write for staff or members of org (or its parent)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_staff:
            return True
        if obj.members.filter(pk=user.pk).exists():
            return True
        if obj.parent_id and obj.parent.members.filter(pk=user.pk).exists():
            return True
        return False
