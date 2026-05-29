from django.contrib.auth import get_user_model
from rest_framework import serializers

try:
    from rest_framework_gis.serializers import GeoFeatureModelSerializer as _GeoBase

    _HAS_GIS = True
except Exception:
    _GeoBase = serializers.ModelSerializer
    _HAS_GIS = False

from .models import Location, Organisation


class LocationSerializer(_GeoBase):
    class Meta:
        model = Location
        fields = ["id", "name", "address", "postcode", "point", "created_at"]


if _HAS_GIS:
    LocationSerializer.Meta.geo_field = "point"


class OrgRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organisation
        fields = ["id", "slug", "name", "is_partner"]


def _can_edit(obj, user) -> bool:
    if not (user and user.is_authenticated):
        return False
    if user.is_staff:
        return True
    if obj.members.filter(pk=user.pk).exists():
        return True
    if obj.parent_id and obj.parent.members.filter(pk=user.pk).exists():
        return True
    return False


class OrganisationSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    event_count = serializers.IntegerField(read_only=True)
    member_count = serializers.IntegerField(read_only=True)
    parent = OrgRefSerializer(read_only=True)
    children = OrgRefSerializer(many=True, read_only=True)
    members = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = [
            "id",
            "slug",
            "name",
            "website",
            "description",
            "is_partner",
            "parent",
            "children",
            "members",
            "member_count",
            "event_count",
            "locations",
            "can_edit",
            "created_at",
            "updated_at",
        ]

    def get_members(self, obj):
        users = obj.members.all().only("id", "username", "email", "first_name", "last_name")
        return [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
            }
            for u in users
        ]

    def get_can_edit(self, obj):
        request = self.context.get("request")
        return _can_edit(obj, getattr(request, "user", None))


class OrganisationListSerializer(serializers.ModelSerializer):
    location_count = serializers.IntegerField(read_only=True)
    event_count = serializers.IntegerField(read_only=True)
    member_count = serializers.IntegerField(read_only=True)
    parent_id = serializers.IntegerField(read_only=True, allow_null=True)
    parent_name = serializers.CharField(read_only=True, source="parent.name", allow_null=True)

    class Meta:
        model = Organisation
        fields = [
            "id",
            "slug",
            "name",
            "website",
            "description",
            "is_partner",
            "parent_id",
            "parent_name",
            "location_count",
            "event_count",
            "member_count",
            "created_at",
        ]


class OrganisationWriteSerializer(serializers.ModelSerializer):
    """For PATCH/PUT. ``is_partner``/``parent``/``members`` are staff-only."""

    members = serializers.PrimaryKeyRelatedField(many=True, queryset=get_user_model().objects.all(), required=False)

    class Meta:
        model = Organisation
        fields = [
            "name",
            "website",
            "description",
            "is_partner",
            "parent",
            "members",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Parent must itself be top-level. Exclude self when known.
        qs = Organisation.objects.filter(parent__isnull=True)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        self.fields["parent"].queryset = qs

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_staff = bool(user and user.is_authenticated and user.is_staff)
        instance = self.instance
        staff_only = {"is_partner", "parent", "members"}
        for f in staff_only:
            if f in attrs:
                if f == "members":
                    cur_ids = set(instance.members.values_list("id", flat=True)) if instance else set()
                    new_ids = {u.pk for u in attrs[f]}
                    changed = cur_ids != new_ids
                else:
                    current = getattr(instance, f, None) if instance else None
                    changed = current != attrs[f]
                if changed and not is_staff:
                    raise serializers.ValidationError({f: "Only staff can change this field."})
        if "parent" in attrs and attrs["parent"] and instance and attrs["parent"].pk == instance.pk:
            raise serializers.ValidationError({"parent": "An organisation cannot be its own parent."})
        if "parent" in attrs and attrs["parent"] and attrs["parent"].parent_id is not None:
            raise serializers.ValidationError({"parent": "Parent must itself be top-level (1-level hierarchy)."})
        # If this org already has children, it cannot become a sub-org.
        if (
            "parent" in attrs
            and attrs["parent"]
            and instance
            and Organisation.objects.filter(parent_id=instance.pk).exists()
        ):
            raise serializers.ValidationError(
                {"parent": "This organisation has sub-organisations and cannot itself be a sub-org."}
            )
        return attrs
