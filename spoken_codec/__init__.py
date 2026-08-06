"""Spoken codec: arbitrary bytes <-> a short list of words, with error correction."""

from .codec import (  # noqa: F401
    BITS,
    DEFAULT_PROFILE,
    MAX_PAYLOAD,
    PROFILES,
    AlphabetError,
    Codec,
    SpokenCodecError,
    UndecodableError,
    decode,
    decode_fixed,
    default_codec,
    encode,
    encode_fixed,
)

__all__ = [
    "BITS", "DEFAULT_PROFILE", "MAX_PAYLOAD", "PROFILES",
    "AlphabetError", "Codec", "SpokenCodecError", "UndecodableError",
    "decode", "decode_fixed", "default_codec", "encode", "encode_fixed",
]
