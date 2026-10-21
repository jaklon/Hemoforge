"""Shared deterministic normalization; unknown alleles are never imputed."""


def normalize_call(call):
    normalized = call.strip().upper().replace("|", "/")
    return "G/A" if normalized == "A/G" else normalized
