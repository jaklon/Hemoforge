import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.agent_config import AgentSettings
from backend.agent_rag import ingest, retrieve


class RagTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.corpus = self.root / "corpus"
        self.corpus.mkdir()
        self.index = self.root / "chroma"
        self.index.mkdir()
        self.settings = AgentSettings(corpus_path=str(self.corpus), rag_path=str(self.index), rag_enabled=True)
        content = b"Reviewed English source material. These are protocol notes, not observations of the active batch."
        (self.corpus / "source.txt").write_bytes(content)
        self.entry = {"path": "source.txt", "title": "Reviewed protocol", "study_id": "independent-protocol",
                      "reference": "local-reviewed-protocol", "sha256": hashlib.sha256(content).hexdigest()}
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(json.dumps([self.entry]))

    def tearDown(self):
        self.directory.cleanup()

    def test_reviewed_ingestion_and_atomic_index_pointer(self):
        client = MagicMock()
        with patch("backend.agent_rag.chroma_client", return_value=client), patch("backend.agent_rag.embedding_identity", return_value="embedding-digest"), \
             patch("backend.agent_rag.embed", return_value=[[0.1, 0.2]]) as embedding:
            descriptor = ingest(self.settings, self.manifest)
        self.assertEqual(descriptor["chunk_count"], 1)
        embedding.assert_called_once()
        self.assertIsNone(client.get_or_create_collection.call_args.kwargs["embedding_function"])
        stored = json.loads((self.index / "index.json").read_text())
        self.assertEqual(stored, descriptor)
        with patch("backend.agent_rag.chroma_client", return_value=client), patch("backend.agent_rag.embedding_identity", return_value="new-digest"), \
             patch("backend.agent_rag.embed", side_effect=ValueError("offline")), self.assertRaises(ValueError):
            ingest(self.settings, self.manifest)
        self.assertEqual(json.loads((self.index / "index.json").read_text()), descriptor)

    def test_traversal_and_hash_mismatch_are_rejected_before_embedding(self):
        with patch("backend.agent_rag.embed") as embedding:
            for change in [{"path": "../outside.txt"}, {"sha256": "wrong"}, {"path": "file.pdf"}]:
                self.manifest.write_text(json.dumps([{**self.entry, **change}]))
                with self.subTest(change=change), self.assertRaises(ValueError):
                    ingest(self.settings, self.manifest)
            embedding.assert_not_called()

    def test_disabled_empty_changed_and_relevant_retrieval_statuses(self):
        self.settings.rag_enabled = False
        with patch("backend.agent_rag.embed") as embedding:
            self.assertEqual(retrieve(self.settings, "Review warning"), ("disabled", []))
            self.settings.rag_enabled = True
            self.assertEqual(retrieve(self.settings, "Review warning"), ("no_corpus", []))
            embedding.assert_not_called()
        (self.index / "index.json").write_text(json.dumps({"embedding_model": self.settings.embedding_model,
            "embedding_digest": "old", "collection": "reviewed-corpus", "chunk_count": 2}))
        with patch("backend.agent_rag.embedding_identity", return_value="changed"), self.assertRaises(ValueError):
            retrieve(self.settings, "Review warning")
        client = MagicMock()
        client.get_collection.return_value.query.return_value = {"ids": [["relevant", "unrelated"]],
            "documents": [["Reviewed excerpt", "Unrelated text"]], "distances": [[0.2, 0.9]],
            "metadatas": [[{"title": "Reviewed protocol", "sha256": "abc"}, {"title": "Unrelated"}]]}
        with patch("backend.agent_rag.embedding_identity", return_value="old"), patch("backend.agent_rag.embed", return_value=[[0.1, 0.2]]), \
             patch("backend.agent_rag.chroma_client", return_value=client):
            status, excerpts = retrieve(self.settings, "Review warning")
        self.assertEqual(status, "retrieved")
        self.assertEqual(len(excerpts), 1)
        self.assertEqual(excerpts[0]["excerpt"], "Reviewed excerpt")


if __name__ == "__main__":
    unittest.main()
