"""
Management command to run the SADIE MCP server.

Usage:
    python manage.py run_mcp --transport stdio        # Default
    python manage.py run_mcp --transport http --port 3000
"""

import asyncio
import logging
import sys
from typing import Any

from django.core.management.base import BaseCommand, CommandError

# Configure logging to stderr ONLY (stdout must be clean for JSON-RPC)
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
    stream=sys.stderr,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Run the SADIE MCP server (stdio or HTTP)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--transport",
            type=str,
            choices=["stdio", "http"],
            default="stdio",
            help="Transport mechanism: stdio (default) or http",
        )
        parser.add_argument(
            "--host",
            type=str,
            default="127.0.0.1",
            help="HTTP host (ignored if transport=stdio)",
        )
        parser.add_argument(
            "--port",
            type=int,
            default=3000,
            help="HTTP port (ignored if transport=stdio)",
        )

    def handle(self, *args: Any, **options: Any) -> str:
        """Main command handler."""
        transport = options.get("transport", "stdio")

        logger.info(f"Starting SADIE MCP server (transport={transport})...")

        try:
            if transport == "stdio":
                self._run_stdio()
            elif transport == "http":
                self._run_http(
                    host=options.get("host", "127.0.0.1"),
                    port=options.get("port", 3000),
                )
            else:
                raise CommandError(f"Unknown transport: {transport}")
        except KeyboardInterrupt:
            logger.info("MCP server interrupted.")
        except Exception as e:
            logger.exception("MCP server error: %s", e)
            raise CommandError(f"MCP server failed: {e}")

    def _run_stdio(self) -> None:
        """Run the server over stdio (SSE)."""
        from mcp.server import Server
        import mcp.server.stdio

        from mcp_server.server import server

        logger.info("Running MCP server over stdio...")
        logger.info("Server is ready. Waiting for calls...")

        # Use mcp.server.stdio for sync-style stdio transport
        # Actually, FastMCP auto-detects stdio if no transport is specified
        # But let's use the async approach with asyncio.run() for consistency
        try:
            asyncio.run(mcp.server.stdio.stdio_server(server))
        except Exception as e:
            logger.exception("Stdio transport error: %s", e)
            raise

    def _run_http(self, host: str = "127.0.0.1", port: int = 3000) -> None:
        """Run the server over HTTP with uvicorn ASGI server."""
        try:
            import uvicorn
            from mcp_server.server import server

            logger.info(f"Running MCP server over HTTP at {host}:{port}...")
            logger.info(f"HTTP endpoint: http://{host}:{port}/sse")

            # Use uvicorn to serve the FastMCP ASGI app
            uvicorn.run(
                server.asgi(),
                host=host,
                port=port,
                log_level="info",
            )
        except Exception as e:
            logger.exception("HTTP transport error: %s", e)
            raise
