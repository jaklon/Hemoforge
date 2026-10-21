"""Bound request bodies, including chunked uploads, before JSON parsing."""

import asyncio

from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes=8 * 1024 * 1024):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        total, chunks = 0, []
        deadline = asyncio.get_running_loop().time() + 15
        while True:
            try:
                remaining = max(0.001, deadline - asyncio.get_running_loop().time())
                message = await asyncio.wait_for(receive(), timeout=remaining)
            except TimeoutError:
                return await JSONResponse({"detail": "Request body timed out."}, status_code=408)(scope, receive, send)
            if message["type"] == "http.disconnect":
                return
            body = message.get("body", b"")
            total += len(body)
            if total > self.max_bytes:
                return await JSONResponse({"detail": "Request body exceeds the local size limit."}, status_code=413)(scope, receive, send)
            chunks.append(body)
            if not message.get("more_body", False):
                break
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
