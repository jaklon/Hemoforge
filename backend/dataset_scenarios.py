"""Finite, versioned coverage catalogue. All severities/loads are teaching assumptions."""
CATALOG = [
    {"id":"baseline","label":"Kultur normal / variasi awal","loads":{}},
    {"id":"acid_load","label":"pH turun bertahap","loads":{"acid_load":1.0}},
    {"id":"alkaline_load","label":"pH naik bertahap","loads":{"acid_load":-1.0}},
    {"id":"low_do","label":"Hambatan aerasi / DO rendah","loads":{"aeration_efficiency":.025}},
    {"id":"high_do","label":"Katup O2 berlebih / DO tinggi","loads":{"gas_enrichment":55.0}},
    {"id":"glucose_depletion","label":"Konsumsi glukosa meningkat","loads":{"extra_glucose":1.5}},
    {"id":"glutamine_depletion","label":"Glutamin menipis (laten / tidak terukur)","loads":{"extra_glutamine":.65}},
    {"id":"lactate_accumulation","label":"Laktat menumpuk","loads":{"extra_lactate":1.25}},
    {"id":"thermal_high","label":"Beban panas / temperatur tinggi","loads":{"thermal_load":3.3}},
    {"id":"thermal_low","label":"Pendinginan berlebih","loads":{"thermal_load":-3.3}},
    {"id":"core_dropout","label":"Sensor inti gagal QC","loads":{},"fault":"core"},
    {"id":"trace_dropout","label":"BioPAT Trace gagal QC","loads":{},"fault":"trace"},
    {"id":"viamass_dropout","label":"BioPAT ViaMass gagal QC","loads":{},"fault":"viamass"},
    {"id":"trace_drift","label":"Bias Trace / kalibrasi terjadwal","loads":{},"bias":"trace"},
    {"id":"viamass_drift","label":"Bias ViaMass / kalibrasi terjadwal","loads":{},"bias":"viamass"},
    {"id":"acid_and_do","label":"Gabungan pH turun + aerasi rendah","loads":{"acid_load":.8,"aeration_efficiency":.035}},
    {"id":"nutrient_and_do","label":"Gabungan nutrisi + aerasi rendah","loads":{"extra_glucose":1.2,"aeration_efficiency":.04}},
    {"id":"thermal_and_lactate","label":"Gabungan panas + laktat","loads":{"thermal_load":3.0,"extra_lactate":.9}},
    {"id":"slow_growth","label":"Pertumbuhan lambat (laten)","loads":{"growth_multiplier":.5}},
    {"id":"unobserved_nutrients","label":"Nutrisi menipis saat Trace gagal QC","loads":{"extra_glucose":1.2},"fault":"trace"},
]
DEFAULT_LOADS = {"acid_load":0.0,"aeration_efficiency":1.0,"gas_enrichment":0.0,"extra_glucose":0.0,
                 "extra_glutamine":0.0,"extra_lactate":0.0,"thermal_load":0.0,"growth_multiplier":1.0}
CATALOG_VERSION="culture-coverage-v1"
