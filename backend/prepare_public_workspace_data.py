"""Convert public BEL-A culture data and 1000 Genomes genotypes into workspace CSV uploads.

Sources: University of Bath dataset 10.15125/BATH-01456 (CC BY 4.0) and Ensembl's
1000 Genomes Phase 3 genotypes. No network request happens unless --download-public-data is supplied.
"""

import argparse
import csv
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from backend.prepare_public_evo2_data import PublicDataClient

BATH_URL = "https://researchdata.bath.ac.uk/1456/1/Paper%201%20raw%20data.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
# g/mol: glucose, glutamine, lactate anion, ammonia.
MOLAR_MASS = {"glucose": 180.16, "glutamine": 146.15, "lactate": 89.07, "ammonia": 17.03}
MARKERS = (("KEL", "rs8176058"), ("SLC14A1", "rs1058396"))


def read_xlsx(path):
    """Return {sheet name: {row number: [cell values]}} using only the standard library."""
    book = zipfile.ZipFile(path)
    shared = [''.join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
              for si in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    targets = {r.get("Id"): r.get("Target").lstrip("/") for r in ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    for sheet in ET.fromstring(book.read("xl/workbook.xml")).find("m:sheets", NS):
        target = targets[sheet.get(REL)]
        rows = {}
        for row in ET.fromstring(book.read(target if target.startswith("xl/") else "xl/" + target)).iter("{%s}row" % NS["m"]):
            cells = {}
            for cell in row.findall("m:c", NS):
                value = cell.find("m:v", NS)
                column = 0
                for letter in re.match(r"[A-Z]+", cell.get("r")).group():
                    column = column * 26 + ord(letter) - 64
                cells[column - 1] = "" if value is None else shared[int(value.text)] if cell.get("t") == "s" else value.text
            if cells:
                rows[int(row.get("r"))] = [cells.get(i, "") for i in range(max(cells) + 1)]
        sheets[sheet.get("name").strip()] = rows
    return sheets


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def culture_rows(growth, volume_ml):
    """Growth curve replicates A-C. Time is stored as Excel days; counts as 10^6 cells/mL."""
    rows, batch = [], None
    for _, cells in sorted(growth.items()):
        label = cells[0].strip() if cells else ""
        if label:
            batch = "BATH-01456-" + label if label in {"A", "B", "C"} else None
            continue
        count = number(cells[1]) if len(cells) > 7 else None
        if batch is None or count is None:
            continue
        days = 0.0 if cells[3] == "00:00:00" else number(cells[3])
        mmol = {name: round(number(cells[i]) / MOLAR_MASS[name], 4)
                for i, name in zip(range(4, 8), ("glucose", "glutamine", "lactate", "ammonia"))}
        rows.append({"batch_id": batch, "cell_line": "BEL-A", "elapsed_hours": round(days * 24, 2),
                     "cell_count_million": round(count * volume_ml, 4),
                     "glucose_mmol_l": mmol["glucose"], "glutamine_mmol_l": mmol["glutamine"],
                     "lactate_mmol_l": mmol["lactate"], "ammonia_mmol_l": mmol["ammonia"]})
    return rows


def experiment_rows(doe):
    """Metabolite DOE runs: lactate x ammonia (mg/L) against live cells (10^5/mL)."""
    rows = []
    for _, cells in sorted(doe.items()):
        if len(cells) > 1 and cells[1].startswith("Condition"):
            break  # The metabolite-measurement table below is not a run list.
        if len(cells) < 6 or number(cells[2]) is None or number(cells[5]) is None:
            continue
        lactate, ammonia = number(cells[3]), number(cells[4])
        rows.append({"condition_id": f"L{lactate:g}-A{ammonia:g}", "lactate_mg_l": lactate, "ammonia_mg_l": ammonia,
                     "response": number(cells[5]), "response_unit": "live_cells_1e5_per_ml"})
    return rows


def marker_rows(client):
    """1000 Genomes Phase 3 forward-strand genotypes for the two built-in markers."""
    calls = {}
    for gene, rs_id in MARKERS:
        for item in client.get(f"/variation/human/{rs_id}?genotypes=1")["genotypes"]:
            if item["sample"].startswith("1000GENOMES:phase_3:"):
                sample = item["sample"].rsplit(":", 1)[1]
                calls.setdefault(sample, {})[f"{gene.lower()}_{rs_id}"] = item["genotype"].replace("|", "/")
    columns = [f"{gene.lower()}_{rs_id}" for gene, rs_id in MARKERS]
    return [{"sample_id": sample, **{c: values.get(c, "./.") for c in columns}} for sample, values in sorted(calls.items())]


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def build(output, cache, allow_download, volume_ml):
    output, cache = Path(output), Path(cache)
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    workbook = cache / "bath-01456.xlsx"
    if not workbook.is_file():
        if not allow_download:
            raise ValueError("Public data is not cached. Downloading requires the explicit --download-public-data flag.")
        with urllib.request.urlopen(urllib.request.Request(BATH_URL, headers={"User-Agent": "HemoForge-public-data/1.0"}), timeout=35) as response:
            workbook.write_bytes(response.read(5 * 1024 * 1024))
    sheets = read_xlsx(workbook)
    outputs = {"bath-bel-a-culture.csv": culture_rows(sheets["Growth curve"], volume_ml),
               "bath-bel-a-experiments.csv": experiment_rows(sheets["Metabolite DOE"]),
               "1000g-phase3-markers.csv": marker_rows(PublicDataClient(cache / "ensembl", allow_download))}
    for name, rows in outputs.items():
        write_csv(output / name, rows)
    return {name: len(rows) for name, rows in outputs.items()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert public BEL-A and 1000 Genomes data into workspace CSV uploads.")
    parser.add_argument("--output", default="public/datasets/workspace")
    parser.add_argument("--cache", default=".cache/workspace-public")
    # ponytail: the Bath sheet reports cells/mL and the paper abstract gives no culture volume; 1 mL keeps
    # growth ratios exact. Pass the real volume once confirmed from the paper's methods.
    parser.add_argument("--volume-ml", type=float, default=1.0)
    parser.add_argument("--download-public-data", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build(args.output, args.cache, args.download_public_data, args.volume_ml), indent=2))
