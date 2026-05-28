from rest_framework import serializers

from .models import SavedView


class SavedViewSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source="user.username", read_only=True)
    is_owner = serializers.SerializerMethodField()
    short_url = serializers.SerializerMethodField()

    class Meta:
        model = SavedView
        fields = [
            "id",
            "name",
            "path",
            "query_string",
            "is_public",
            "slug",
            "owner_username",
            "is_owner",
            "short_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["slug", "owner_username", "is_owner", "short_url"]

    def get_is_owner(self, obj: SavedView) -> bool:
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.user_id == request.user.id)

    def get_short_url(self, obj: SavedView) -> str:
        return f"/v/{obj.slug}/"
