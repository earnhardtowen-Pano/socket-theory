"""Spoken codec: arbitrary bytes <-> a short list of words, with error correction.

The channel this is built for is a human voice: someone reads the words aloud
and someone else writes them down. That channel produces three kinds of damage,
and the codec handles each one differently.

  substitution  a word was heard as a different alphabet word ("ball" -> "call").
                Position unknown, value wrong. Costs 2 units of parity.
  erasure       a word was not heard as any alphabet word ("...mumble...") or
                was left blank. Position known. Costs 1 unit of parity.
  sync loss     a word was dropped or an extra one written down. Everything
                after it shifts, so Reed-Solomon alone cannot see it.

A profile buys `nsym` units of parity. Erasures are half the price of
substitutions, so surfacing them instead of discarding them roughly doubles
what a given profile can survive. Sync loss is repaired by search: reinsert or
remove one word at each position and see which candidate passes the checksum.

Every frame carries a CRC-16 over its header and payload. Reed-Solomon on its
own will occasionally "correct" damage beyond its capacity into a clean-looking
but wrong frame; the CRC turns those into an honest failure, and it is what
makes the sync-loss search safe to run.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Sequence

from reedsolo import RSCodec, ReedSolomonError

__all__ = [
    "SpokenCodecError", "UndecodableError", "AlphabetError",
    "Codec", "encode", "decode", "encode_fixed", "decode_fixed",
    "PROFILES", "BITS", "MAX_PAYLOAD", "DEFAULT_PROFILE",
]

BITS = 11                       # bits carried by one spoken word
ALPHABET_SIZE = 1 << BITS       # 2048
HEADER_BITS = 11                # 2 bits profile + 9 bits payload length
LENGTH_BITS = 9
CRC_BITS = 16
MAX_PAYLOAD = (1 << LENGTH_BITS) - 1     # 511 bytes

# profile -> Reed-Solomon parity symbols. Each profile corrects up to
# nsym // 2 substitutions, or up to nsym erasures, or a mix where
# 2 * substitutions + erasures <= nsym.
PROFILES = {0: 2, 1: 4, 2: 8, 3: 16}
DEFAULT_PROFILE = 1

# Repairing sync loss tries a candidate at every position, so the search is
# O(n^2). The saving grace is that the header symbol names its own profile, and
# a dropped or inserted word almost never lands on symbol 0 -- so the first
# sweep needs only the profile the header claims, and runs every position for a
# quarter of the cost. Only if that finds nothing do the other profiles get a
# turn, and that second sweep is bounded by the budget below (denominated in
# symbol-decodes, so long frames degrade to a partial search rather than a
# stall). Both are failure-path costs; a repair that works lands in the first
# sweep in milliseconds.
REPAIR_BUDGET = 120_000


class SpokenCodecError(Exception):
    """Base class for every error this module raises deliberately."""


class UndecodableError(SpokenCodecError):
    """The words could not be resolved into a frame that passes its checksum."""


class AlphabetError(SpokenCodecError):
    """The word list is not a usable alphabet."""


def _crc16(data: bytes) -> int:
    """CRC-16/CCITT-FALSE. Poly 0x1021, init 0xFFFF, no reflection."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def _pack_bits(bitstr: str) -> list[int]:
    """Split a bit string into BITS-wide symbols, zero-padding the last one."""
    bitstr += "0" * (-len(bitstr) % BITS)
    return [int(bitstr[i:i + BITS], 2) for i in range(0, len(bitstr), BITS)]


def _normalise(token: str) -> str:
    """Reduce a heard token to comparable letters. Empty means 'not heard'."""
    return "".join(ch for ch in str(token).lower() if ch.isalpha())


def _edits1_apart(a: str, b: str) -> bool:
    """True if one substitution, insertion or deletion turns a into b."""
    if a == b:
        return False
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    short, long = (a, b) if len(a) < len(b) else (b, a)
    for i in range(len(long)):
        if long[:i] + long[i + 1:] == short:
            return True
    return False


class Codec:
    """A codec bound to one word alphabet.

    Build your own to use a different alphabet; the module-level ``encode`` and
    ``decode`` delegate to a default instance loaded from ``alphabet.txt``.
    """

    def __init__(self, words: Sequence[str]):
        words = [w.strip().lower() for w in words]
        if len(words) != ALPHABET_SIZE:
            raise AlphabetError(f"alphabet must hold exactly {ALPHABET_SIZE} words, got {len(words)}")
        if len(set(words)) != ALPHABET_SIZE:
            raise AlphabetError("alphabet contains duplicate words")
        if not all(w.isalpha() for w in words):
            raise AlphabetError("alphabet words must be alphabetic")

        self.words = words
        self.index = {w: i for i, w in enumerate(words)}
        self._rs = {p: RSCodec(nsym, c_exp=BITS) for p, nsym in PROFILES.items()}

        # Prefix buckets power the "heard it nearly right" recovery below.
        # Most spoken alphabets (BIP-39 among them) guarantee that four
        # characters identify a word uniquely, which makes this cheap and exact.
        self._prefix: dict[str, list[str]] = {}
        for w in words:
            self._prefix.setdefault(w[:4], []).append(w)

    # ---- classmethods -------------------------------------------------

    @classmethod
    def from_file(cls, path: str | os.PathLike) -> "Codec":
        text = Path(path).read_text(encoding="utf-8")
        return cls([w for w in (line.strip() for line in text.splitlines()) if w])

    # ---- encoding -----------------------------------------------------

    def encode(self, payload: bytes, profile: int = DEFAULT_PROFILE) -> list[str]:
        """Turn bytes into a list of words that can be read aloud."""
        payload = bytes(payload)
        if profile not in PROFILES:
            raise ValueError(f"unknown profile {profile!r}; expected one of {sorted(PROFILES)}")
        if len(payload) > MAX_PAYLOAD:
            raise ValueError(f"payload must be 0-{MAX_PAYLOAD} bytes, got {len(payload)}")

        crc = _crc16(self._crc_input(profile, payload))
        bits = (f"{profile:02b}{len(payload):0{LENGTH_BITS}b}"
                + "".join(f"{b:08b}" for b in payload)
                + f"{crc:0{CRC_BITS}b}")
        syms = _pack_bits(bits)
        return [self.words[s] for s in self._rs[profile].encode(syms)]

    @staticmethod
    def _crc_input(profile: int, payload: bytes) -> bytes:
        return bytes([profile]) + len(payload).to_bytes(2, "big") + payload

    # ---- decoding -----------------------------------------------------

    def decode(self, spoken: Iterable[str] | str, *, repair: bool = True,
               fuzzy: bool = True) -> bytes:
        """Turn heard words back into bytes.

        ``spoken`` may be a list of words or one whitespace-separated string.
        A token that is not an alphabet word — a blank, a ``None``, a mumble —
        becomes an erasure at that position rather than an immediate failure.

        ``fuzzy`` lets a near-miss ("abandonned") resolve to its unique
        alphabet neighbour before falling back to an erasure.
        ``repair`` allows a search for a single dropped or inserted word.
        """
        tokens = spoken.split() if isinstance(spoken, str) else list(spoken)
        if not tokens:
            raise UndecodableError("no words given")

        syms, erasures = self._resolve(tokens, fuzzy=fuzzy)

        found = self._attempt(syms, erasures)
        if found is not None:
            return found

        if repair:
            found = self._repair(syms, erasures)
            if found is not None:
                return found

        raise UndecodableError(
            f"undecodable: {len(syms)} words, {len(erasures)} not recognised; "
            "damage exceeds the parity carried by the frame"
        )

    # ---- internals ----------------------------------------------------

    def _resolve(self, tokens: Sequence[str], *, fuzzy: bool = True) -> tuple[list[int], list[int]]:
        """Map heard tokens to symbols, collecting positions we could not read."""
        syms: list[int] = []
        erasures: list[int] = []
        for i, token in enumerate(tokens):
            hit = self._match(token, fuzzy)
            if hit is None:
                syms.append(0)          # placeholder; the erasure marks it unknown
                erasures.append(i)
            else:
                syms.append(hit)
        return syms, erasures

    def _match(self, token, fuzzy: bool) -> int | None:
        """Resolve one heard token to a symbol, or None to mark an erasure."""
        if token is None:
            return None
        word = _normalise(token)
        if not word:
            return None
        hit = self.index.get(word)
        if hit is not None:
            return hit
        if not fuzzy:
            return None

        # A unique four-character prefix is the strongest cheap signal.
        bucket = self._prefix.get(word[:4], ())
        if len(bucket) == 1:
            return self.index[bucket[0]]

        # Otherwise accept a neighbour only when it is the only one. An
        # ambiguous guess would cost two units of parity; an erasure costs one.
        near = [w for w in self.words if _edits1_apart(word, w)]
        if len(near) == 1:
            return self.index[near[0]]
        return None

    def _attempt(self, syms: Sequence[int], erasures: Sequence[int],
                 profiles: Sequence[int] | None = None) -> bytes | None:
        """Try the given profiles against these symbols. None if none fits."""
        for profile in (PROFILES if profiles is None else profiles):
            nsym = PROFILES[profile]
            if len(syms) <= nsym or len(erasures) > nsym:
                continue
            try:
                fixed = list(self._rs[profile].decode(list(syms), erase_pos=list(erasures))[0])
            except (ReedSolomonError, ZeroDivisionError, IndexError):
                continue
            payload = self._parse(fixed, profile, len(syms) - nsym)
            if payload is not None:
                return payload
        return None

    def _parse(self, fixed: Sequence[int], profile: int, nsyms: int) -> bytes | None:
        """Read a corrected symbol run as a frame, or reject it."""
        bits = "".join(f"{s:0{BITS}b}" for s in fixed)
        if len(bits) < HEADER_BITS:
            return None
        if int(bits[:2], 2) != profile:
            return None
        length = int(bits[2:HEADER_BITS], 2)

        need = HEADER_BITS + length * 8 + CRC_BITS
        if len(bits) < need:
            return None
        # The frame must occupy exactly the symbols it claims. A miscorrection
        # that lands on a plausible header usually fails this before the CRC.
        if -(-need // BITS) != nsyms:
            return None

        body = bits[HEADER_BITS:HEADER_BITS + length * 8]
        payload = bytes(int(body[i:i + 8], 2) for i in range(0, length * 8, 8))
        crc = int(bits[HEADER_BITS + length * 8:need], 2)
        if crc != _crc16(self._crc_input(profile, payload)):
            return None
        return payload

    def _repair(self, syms: Sequence[int], erasures: Sequence[int]) -> bytes | None:
        """Search for a single dropped or inserted word.

        Reed-Solomon has no way to see sync loss, so the only handle on it is
        to guess where it happened and test the guess. Every candidate is
        validated by the CRC before being returned, which is what makes a
        search like this safe: a wrong guess is rejected rather than handed
        back as data.

        The profile the header claims gets a complete sweep first; the others
        share REPAIR_BUDGET, so a long unrecoverable frame degrades to a
        partial search instead of a stall.
        """
        likely = syms[0] >> (BITS - 2) if syms and 0 not in erasures else None
        if likely in PROFILES:
            rest = [p for p in PROFILES if p != likely]
            found = self._sweep(syms, erasures, [likely])
            if found is not None:
                return found
        else:
            rest = list(PROFILES)

        limit = max(1, REPAIR_BUDGET // max(1, len(syms) * len(rest)))
        return self._sweep(syms, erasures, rest, limit)

    @staticmethod
    def _candidates(syms: Sequence[int], erasures: Sequence[int]):
        """Every one-word resync of this frame, as (symbols, erasure positions)."""
        for i in range(len(syms) + 1):
            # A word was dropped: put a placeholder back and mark it unknown.
            yield (list(syms[:i]) + [0] + list(syms[i:]),
                   sorted([e + (1 if e >= i else 0) for e in erasures] + [i]))
        for i in range(len(syms)):
            # A word was invented: take it back out.
            yield (list(syms[:i]) + list(syms[i + 1:]),
                   sorted(e - 1 if e > i else e for e in erasures if e != i))

    def _sweep(self, syms: Sequence[int], erasures: Sequence[int],
               profiles: Sequence[int], limit: int | None = None) -> bytes | None:
        if not profiles:
            return None
        for n, (trial, marks) in enumerate(self._candidates(syms, erasures)):
            if limit is not None and n >= limit:
                break
            found = self._attempt(trial, marks, profiles)
            if found is not None:
                return found
        return None

    # ---- fixed-width mode ---------------------------------------------
    # No header and no checksum: the width is agreed in advance, so every
    # spoken word is payload. Cheaper, but a frame that decodes wrongly has
    # far less to give it away — prefer the header mode when you can.

    def encode_fixed(self, value: int, width_bits: int, parity: int = 2) -> list[str]:
        if width_bits <= 0:
            raise ValueError("width_bits must be positive")
        if parity < 0:
            raise ValueError("parity must be non-negative")
        if not 0 <= value < 1 << width_bits:
            raise ValueError(f"value does not fit in {width_bits} bits")

        k = -(-width_bits // BITS)
        bits = f"{value:0{k * BITS}b}"
        syms = [int(bits[i:i + BITS], 2) for i in range(0, k * BITS, BITS)]
        return [self.words[s] for s in RSCodec(parity, c_exp=BITS).encode(syms)]

    def decode_fixed(self, spoken: Iterable[str] | str, width_bits: int,
                     parity: int = 2, *, fuzzy: bool = True) -> int:
        if width_bits <= 0:
            raise ValueError("width_bits must be positive")
        tokens = spoken.split() if isinstance(spoken, str) else list(spoken)
        k = -(-width_bits // BITS)
        if len(tokens) != k + parity:
            raise UndecodableError(f"expected {k + parity} words, got {len(tokens)}")

        syms, erasures = self._resolve(tokens, fuzzy=fuzzy)
        if len(erasures) > parity:
            raise UndecodableError(f"{len(erasures)} words not recognised, parity covers {parity}")
        try:
            fixed = list(RSCodec(parity, c_exp=BITS).decode(syms, erase_pos=erasures)[0])
        except (ReedSolomonError, ZeroDivisionError, IndexError) as exc:
            raise UndecodableError(f"undecodable: {exc}") from exc

        value = int("".join(f"{s:0{BITS}b}" for s in fixed[:k]), 2)
        # When width_bits is not a multiple of BITS the leading pad bits must be
        # zero. It is weak detection, but it is free.
        if value >= 1 << width_bits:
            raise UndecodableError(f"decoded value overflows {width_bits} bits")
        return value


# ---- module-level default -------------------------------------------------

_DEFAULT_ALPHABET = Path(__file__).with_name("alphabet.txt")
_default: Codec | None = None


def default_codec() -> Codec:
    """The codec built from ``alphabet.txt``, or ``$SPOKEN_ALPHABET`` if set."""
    global _default
    if _default is None:
        _default = Codec.from_file(os.environ.get("SPOKEN_ALPHABET") or _DEFAULT_ALPHABET)
    return _default


def encode(payload: bytes, profile: int = DEFAULT_PROFILE) -> list[str]:
    return default_codec().encode(payload, profile)


def decode(spoken: Iterable[str] | str, *, repair: bool = True, fuzzy: bool = True) -> bytes:
    return default_codec().decode(spoken, repair=repair, fuzzy=fuzzy)


def encode_fixed(value: int, width_bits: int, parity: int = 2) -> list[str]:
    return default_codec().encode_fixed(value, width_bits, parity)


def decode_fixed(spoken: Iterable[str] | str, width_bits: int, parity: int = 2,
                 *, fuzzy: bool = True) -> int:
    return default_codec().decode_fixed(spoken, width_bits, parity, fuzzy=fuzzy)
