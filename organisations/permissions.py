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


def is_org_editor(user, org) -> bool:
    """Shared staff-or-member(-of-parent) check, for objects that reference
    an ``organisation`` rather than being one themselves (e.g. ``OrgGoal``)."""
    if not (user and user.is_authenticated):
        return False
    if user.is_staff:
        return True
    if org.members.filter(pk=user.pk).exists():
        return True
    if org.parent_id and org.parent.members.filter(pk=user.pk).exists():
        return True
    return False


class IsOrgGoalEditor(BasePermission):
    """Read for anyone; write for staff or members of the goal's org (or its parent)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        return is_org_editor(request.user, obj.organisation)
