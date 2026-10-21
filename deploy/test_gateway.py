import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from deploy import gateway


class GatewayTests(unittest.TestCase):
    def test_authentication_model_allowlist_resource_bounds_and_no_administration(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "token"
            secret.write_text("a" * 64)
            with patch.object(gateway, "TOKEN_FILE", str(secret)), TestClient(gateway.app) as client:
                calls = []

                async def handler(request):
                    calls.append(request)
                    if request.url.path == "/api/tags":
                        return httpx.Response(200, json={"models": [{"name": gateway.CHAT_MODEL}, {"name": gateway.EMBED_MODEL + ":latest"}, {"name": "private-model"}]})
                    body = json.loads(request.content)
                    self.assertLessEqual(body["options"]["num_predict"], 384)
                    self.assertEqual(body["options"]["num_gpu"], 0)
                    return httpx.Response(200, json={"done": True, "message": {"content": "{}"}})

                original = gateway.app.state.client
                async_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
                gateway.app.state.client = async_client
                self.assertEqual(client.get("/api/tags").status_code, 401)
                auth = {"Authorization": "Bearer " + "a" * 64}
                self.assertEqual(client.get("/health").status_code, 200)
                self.assertEqual(len(client.get("/api/tags", headers=auth).json()["models"]), 2)
                self.assertEqual(client.post("/api/pull", headers=auth, json={"model": "other"}).status_code, 404)
                self.assertEqual(client.delete("/api/delete", headers=auth).status_code, 405)
                self.assertEqual(client.post("/api/chat", headers=auth, json={"model": "other"}).status_code, 422)
                body = {"model": gateway.CHAT_MODEL, "messages": [{"role": "user", "content": "Review evidence"}],
                        "format": {"type": "object"}, "stream": False, "options": {"num_predict": 999999, "num_gpu": 99}}
                self.assertEqual(client.post("/api/chat", headers=auth, json=body).status_code, 200)
                body["stream"] = True
                self.assertEqual(client.post("/api/chat", headers=auth, json=body).status_code, 422)
                self.assertEqual(client.post("/api/chat", headers=auth, content=b"x" * (128 * 1024 + 1)).status_code, 413)
                gateway.app.state.client = original
                client.portal.call(async_client.aclose)

    def test_missing_or_short_secret_prevents_startup(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "token"
            secret.write_text("short")
            with patch.object(gateway, "TOKEN_FILE", str(secret)), self.assertRaises(RuntimeError):
                with TestClient(gateway.app):
                    pass


if __name__ == "__main__":
    unittest.main()
