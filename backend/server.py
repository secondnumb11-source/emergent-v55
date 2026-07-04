"""
Reverse proxy backend.

The imported project (TanStack Start + Vite) serves its own API routes
(src/routes/api/*) from the Vite dev server on port 3000. However, the
Kubernetes ingress routes all /api/* traffic to this backend on port 8001.

This FastAPI app transparently forwards every /api/* request to the
frontend dev server so the app's server routes keep working through the
preview URL. Do not add business logic here - the real API handlers live
in /app/frontend/src/routes/api/.
"""

import os
import logging

import httpx
from dotenv import load_dotenv
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import Response

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("api-proxy")

FRONTEND_ORIGIN = os.environ.get("PROXY_TARGET", "http://localhost:3000")

# Hop-by-hop headers must not be forwarded (RFC 2616 section 13.5.1)
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
}

app = FastAPI(title="API Proxy -> Vite dev server")

client = httpx.AsyncClient(
    base_url=FRONTEND_ORIGIN,
    timeout=httpx.Timeout(120.0, connect=10.0),
    follow_redirects=False,
)


@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(request: Request, path: str):
    url = f"/api/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP
    }

    body = await request.body()

    try:
        upstream = await client.request(
            request.method,
            url,
            headers=headers,
            content=body if body else None,
        )
    except httpx.ConnectError:
        logger.error("Frontend dev server unreachable at %s", FRONTEND_ORIGIN)
        return Response(
            content='{"error":"frontend dev server is not running yet"}',
            status_code=502,
            media_type="application/json",
        )
    except httpx.TimeoutException:
        logger.error("Upstream timeout for %s %s", request.method, url)
        return Response(
            content='{"error":"upstream timeout"}',
            status_code=504,
            media_type="application/json",
        )

    response_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP
    }

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )
