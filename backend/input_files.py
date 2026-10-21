import csv
import io
import json
from pathlib import Path


def read_table(content: bytes, name: str, kind: str):
    if not content or len(content) > 2 * 1024 * 1024:
        raise ValueError("Choose a non-empty file up to 2 MB.")
    text = content.decode("utf-8-sig")
    extension = Path(name).suffix.lower()
    if extension == ".json":
        rows = json.loads(text)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("JSON must contain an array of row objects.")
    elif extension in (".csv", ".tsv"):
        reader = csv.DictReader(io.StringIO(text), delimiter="\t" if extension == ".tsv" else ",", strict=True)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError("Use unique column headers.")
        try:
            rows = list(reader)
        except csv.Error as error:
            raise ValueError("Malformed CSV/TSV. Check quoted fields.") from error
        if any(None in row or any(value is None for value in row.values()) for row in rows):
            raise ValueError("Each row must have the same number of columns as the header.")
    else:
        raise ValueError("Use CSV, TSV, or JSON.")
    if not 1 <= len(rows) <= 10_000:
        raise ValueError("Use 1 to 10,000 rows.")
    required = ({"batch_id", "elapsed_hours", "cell_count_million"} if kind == "culture" else
                {"condition_id", "lactate_mg_l", "ammonia_mg_l", "response", "response_unit"})
    if any(not required.issubset(row) for row in rows):
        raise ValueError("Required columns: " + ", ".join(sorted(required)))
    return rows
