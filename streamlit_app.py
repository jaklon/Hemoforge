import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st
from pydantic import ValidationError

from backend.input_files import read_table
from backend.models import ExperimentRequest, GrowthRequest

API = "http://127.0.0.1:8000"
EXAMPLES = Path(__file__).parent / "public" / "examples"


def call_api(route, payload):
    request = urllib.request.Request(
        API + route, json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise ValueError(json.load(error).get("detail", "Prediction failed.")) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise ValueError("Python service unavailable. Run start-python.ps1, then try again.") from error


st.set_page_config(page_title="HemoForge · Python lab", page_icon="🧬", layout="wide")
st.title("HemoForge · Python lab")
st.caption("Upload → Predict → Export · Exploratory models")
st.sidebar.link_button("Open HemoForge website", os.environ.get("HEMOFORGE_WEBSITE_URL", "http://localhost:8443/#data"))
st.sidebar.link_button("API documentation", API + "/docs")
prediction = st.selectbox("Prediction", ["Cell growth", "Experiment response"])
kind = "culture" if prediction == "Cell growth" else "experiments"
uploaded = st.file_uploader("Data file", type=["csv", "tsv", "json"], key=kind)
example = st.checkbox("Use synthetic example data", value=True, key=kind + "-example", disabled=uploaded is not None)

if uploaded is not None:
    content, name = uploaded.getvalue(), uploaded.name
elif example:
    name = f"hemogpt-example-{kind}.csv"
    content = (EXAMPLES / name).read_bytes()
    st.caption("Synthetic example · Replace with your own measurements when ready.")
else:
    st.info("Drop a file above or enable example data.")
    st.stop()

source_hash = hashlib.sha256(content).hexdigest()
try:
    rows = read_table(content, name, kind)
    with st.expander(f"Preview · {name} · {len(rows)} rows"):
        st.dataframe(pd.DataFrame(rows).head(25), hide_index=True)
    if kind == "culture":
        batches = list(dict.fromkeys(str(row["batch_id"]).strip() for row in rows))
        if len(batches) > 30 or any(not batch for batch in batches):
            raise ValueError("Use 1 to 30 named batches.")
        left, right = st.columns(2)
        batch = left.selectbox("Batch", batches)
        samples = [{"hour": row["elapsed_hours"],
                    "count": None if row["cell_count_million"] in (None, "") else row["cell_count_million"]}
                   for row in rows if str(row["batch_id"]).strip() == batch]
        end = max(float(sample["hour"]) for sample in samples)
        cutoff = right.number_input("Use measurements through hour", min_value=0.0, max_value=end, value=end)
        horizon = left.selectbox("Predict next", [24, 48, 72], index=2, format_func=lambda value: f"{value} hours")
        seed = right.number_input("Random seed", min_value=0, max_value=2_147_483_647, value=42)
        payload = GrowthRequest(samples=samples, as_of_hour=cutoff, horizon=horizon, seed=seed, source_hash=source_hash).model_dump()
        route = "/api/predict/growth"
    else:
        goal = st.selectbox("Goal", ["maximize", "minimize"])
        payload = ExperimentRequest(rows=rows, objective=goal, source_hash=source_hash).model_dump()
        route = "/api/predict/experiments"
except (ValueError, UnicodeError, ValidationError) as error:
    # Avoid including input records in validation errors.
    message = "; ".join(item["msg"] for item in error.errors()[:3]) if isinstance(error, ValidationError) else str(error)
    st.error(message)
    st.stop()

fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
if st.button("Run prediction", type="primary"):
    try:
        with st.spinner("Running Python model…"):
            response = call_api(route, payload)
        st.session_state["prediction_result"] = (fingerprint, response)
    except ValueError as error:
        st.error(str(error))
        st.stop()

saved = st.session_state.get("prediction_result")
if saved and saved[0] == fingerprint:
    response = saved[1]
    result = response["result"]
    st.success("Python prediction complete")
    if kind == "culture":
        forecast = pd.DataFrame(result["distribution"])
        final = forecast.iloc[-1]
        left, right = st.columns(2)
        left.metric("Predicted median · million cells", f"{final['median']:.3g}")
        right.metric("95% simulated range", f"{final['lower95']:.3g} – {final['upper95']:.3g}")
        base = alt.Chart(forecast).encode(x=alt.X("hour:Q", title="Elapsed hours"))
        band = base.mark_area(opacity=0.15, color="#376979").encode(y=alt.Y("lower95:Q", title="Million cells"), y2="upper95:Q")
        median = base.mark_line(color="#376979", strokeDash=[5, 4]).encode(y="median:Q")
        recorded = pd.DataFrame([{"hour": float(s["hour"]), "count": float(s["count"])} for s in samples if float(s["hour"]) <= cutoff])
        measured = alt.Chart(recorded).mark_line(point=True, color="#b4232b").encode(x="hour:Q", y="count:Q")
        st.altair_chart(band + median + measured, width="stretch")
        st.caption("Red: measured · Dashed: simulated median · Shading: 95% range")
    else:
        st.dataframe(pd.DataFrame(result["ranked"]), hide_index=True)
        left, right = st.columns(2)
        left.metric("Held-out mean absolute error", f"{result['mae']:.4g}")
        right.metric("Baseline error", f"{result['baselineMAE']:.4g}")
    st.download_button("Download prediction JSON", json.dumps(response, indent=2), "hemogpt-python-prediction.json", "application/json")
    with st.expander("Model & source details"):
        st.json({key: value for key, value in response.items() if key != "result"})
elif saved:
    st.info("Settings changed. Run prediction again.")

with st.expander("Examples & model limits"):
    for file_kind in ("culture", "experiments"):
        file = EXAMPLES / f"hemogpt-example-{file_kind}.csv"
        st.download_button(f"Download {file_kind} CSV", file.read_bytes(), file.name, "text/csv", key=file_kind + "-download")
    st.write("Growth uses 500 random paths fitted only to counts available at the chosen hour. Experiment rankings use a fixed RBF Gaussian process and compare repeat measurements of observed conditions. These models are exploratory; they do not establish maturation, harvest readiness, or clinical compatibility. Data is processed on this computer and is not saved by the prediction service.")
