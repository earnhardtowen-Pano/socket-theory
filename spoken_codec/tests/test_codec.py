"""Tests for the spoken codec.

The interesting properties are statistical, so several tests run a seeded
sweep rather than a single case. Seeds are fixed to keep failures reproducible.
"""

import random

import pytest
from reedsolo import RSCodec

from spoken_codec import (
    PROFILES,
    AlphabetError,
    Codec,
    UndecodableError,
    decode,
    decode_fixed,
    default_codec,
    encode,
    encode_fixed,
)
from spoken_codec.codec import BITS, MAX_PAYLOAD, _crc16


WORDS = default_codec().words


def payload(n, rng):
    return bytes(rng.getrandbits(8) for _ in range(n))


# ---- round trips ----------------------------------------------------------

@pytest.mark.parametrize("profile", sorted(PROFILES))
@pytest.mark.parametrize("size", [0, 1, 2, 3, 7, 8, 16, 64, 255, 511])
def test_clean_round_trip(profile, size):
    rng = random.Random(f"{profile}:{size}")
    data = payload(size, rng)
    assert decode(encode(data, profile)) == data


def test_round_trip_accepts_a_plain_string():
    words = encode(b"socket theory")
    assert decode(" ".join(words)) == b"socket theory"


def test_case_and_punctuation_are_tolerated():
    words = encode(b"noisy")
    messy = [w.upper() if i % 2 else f" {w}, " for i, w in enumerate(words)]
    assert decode(messy) == b"noisy"


def test_payload_length_is_bounded():
    with pytest.raises(ValueError):
        encode(bytes(MAX_PAYLOAD + 1))


def test_unknown_profile_rejected():
    with pytest.raises(ValueError):
        encode(b"x", profile=9)


# ---- substitution correction ---------------------------------------------

@pytest.mark.parametrize("profile", sorted(PROFILES))
def test_corrects_substitutions_up_to_capacity(profile):
    """nsym parity symbols correct nsym // 2 wrong words."""
    rng = random.Random(f"sub:{profile}")
    limit = PROFILES[profile] // 2
    for _ in range(40):
        data = payload(24, rng)
        words = encode(data, profile)
        for i in rng.sample(range(len(words)), limit):
            words[i] = rng.choice(WORDS)
        assert decode(words, repair=False) == data


# ---- erasure correction ---------------------------------------------------

@pytest.mark.parametrize("profile", sorted(PROFILES))
def test_corrects_erasures_up_to_capacity(profile):
    """An unreadable word has a known position, so it costs half as much.

    This is the property the original codec threw away by raising on the
    first token it did not recognise.
    """
    rng = random.Random(f"era:{profile}")
    limit = PROFILES[profile]
    for _ in range(40):
        data = payload(24, rng)
        words = encode(data, profile)
        for i in rng.sample(range(len(words)), limit):
            words[i] = "???"
        assert decode(words, repair=False) == data


def test_erasures_beyond_capacity_fail_cleanly():
    rng = random.Random("era-over")
    data = payload(24, rng)
    words = encode(data, 1)
    for i in rng.sample(range(len(words)), PROFILES[1] + 1):
        words[i] = "???"
    with pytest.raises(UndecodableError):
        decode(words, repair=False)


def test_blank_and_none_tokens_are_erasures():
    data = b"gaps in the dictation"
    words = encode(data, 1)
    words[2] = ""
    words[5] = None
    assert decode(words) == data


def test_mixed_substitution_and_erasure():
    """2 * substitutions + erasures <= nsym is the real budget."""
    rng = random.Random("mixed")
    data = payload(24, rng)
    words = encode(data, 2)          # nsym = 8
    spots = rng.sample(range(len(words)), 5)
    for i in spots[:3]:              # 3 erasures  -> 3 units
        words[i] = "???"
    for i in spots[3:]:              # 2 wrong words -> 4 units, total 7 <= 8
        words[i] = rng.choice(WORDS)
    assert decode(words, repair=False) == data


# ---- near misses ----------------------------------------------------------

def test_near_miss_resolves_to_its_neighbour():
    """A misspelling should not consume any parity at all."""
    words = encode(b"heard it nearly right", 0)     # nsym = 2, no slack
    words[1] = words[1] + "e"
    words[4] = words[4][:-1]
    assert decode(words, repair=False) == b"heard it nearly right"


def test_fuzzy_can_be_switched_off():
    words = encode(b"strict", 0)
    mangled = list(words)
    mangled[0] = mangled[0] + "e"
    mangled[1] = mangled[1] + "e"
    mangled[2] = mangled[2] + "e"
    with pytest.raises(UndecodableError):
        decode(mangled, fuzzy=False, repair=False)


# ---- sync loss ------------------------------------------------------------

def test_repairs_a_dropped_word():
    rng = random.Random("drop")
    for _ in range(20):
        data = payload(16, rng)
        words = encode(data, 1)
        del words[rng.randrange(len(words))]
        assert decode(words) == data


def test_repairs_an_inserted_word():
    rng = random.Random("insert")
    for _ in range(20):
        data = payload(16, rng)
        words = encode(data, 1)
        words.insert(rng.randrange(len(words) + 1), rng.choice(WORDS))
        assert decode(words) == data


@pytest.mark.parametrize("where", ["first", "middle", "last"])
@pytest.mark.parametrize("kind", ["drop", "insert"])
def test_repairs_sync_loss_at_any_position(kind, where):
    """Position 0 matters: the repair search reads the profile off symbol 0,
    so damage that lands there defeats its first sweep and must still be
    caught by the fallback."""
    rng = random.Random(f"{kind}:{where}")
    for _ in range(10):
        data = payload(16, rng)
        words = encode(data, 1)
        i = {"first": 0, "middle": len(words) // 2, "last": len(words) - 1}[where]
        if kind == "drop":
            del words[i]
        else:
            words.insert(i, rng.choice(WORDS))
        assert decode(words) == data


def test_repairs_sync_loss_alongside_an_erasure():
    """A dropped word costs one erasure to put back, leaving nsym - 1."""
    rng = random.Random("drop+erasure")
    for _ in range(10):
        data = payload(16, rng)
        words = encode(data, 1)          # nsym = 4
        words[2] = "???"
        del words[len(words) // 2]
        assert decode(words) == data


def test_repair_can_be_switched_off():
    data = payload(16, random.Random("norepair"))
    words = encode(data, 1)
    del words[3]
    with pytest.raises(UndecodableError):
        decode(words, repair=False)


# ---- the safety property --------------------------------------------------

def test_damage_beyond_capacity_never_returns_wrong_bytes():
    """The headline guarantee: fail loudly, never quietly hand back garbage.

    Reed-Solomon alone miscorrects into a clean-looking frame roughly 1% of
    the time at profile 0. The CRC is what turns that into an exception.
    """
    rng = random.Random("silent")
    silent_wrong = 0
    for profile in sorted(PROFILES):
        over = PROFILES[profile] // 2 + 1
        for _ in range(400):
            data = payload(20, rng)
            words = encode(data, profile)
            for i in rng.sample(range(len(words)), over):
                words[i] = rng.choice(WORDS)
            try:
                got = decode(words, repair=False)
            except UndecodableError:
                continue
            if got != data:
                silent_wrong += 1
    assert silent_wrong == 0


def test_random_words_do_not_decode():
    """Noise should be rejected, not read as an empty payload."""
    rng = random.Random("noise")
    accepted = 0
    for _ in range(300):
        words = [rng.choice(WORDS) for _ in range(rng.randint(3, 20))]
        try:
            decode(words)
        except UndecodableError:
            continue
        accepted += 1
    assert accepted == 0


def test_repeated_word_is_not_a_valid_frame():
    """The original read ['abandon'] * 3 as a valid empty payload."""
    with pytest.raises(UndecodableError):
        decode([WORDS[0]] * 3)


def test_empty_input_raises_cleanly():
    with pytest.raises(UndecodableError):
        decode([])


def test_crc_is_checked_over_the_header_too():
    """A corrupted length field must not survive, even if the payload is intact."""
    codec = default_codec()
    data = b"length matters"
    words = codec.encode(data, 0)
    syms = [codec.index[w] for w in words]
    # Flip the length field in the header symbol, then re-parity so that
    # Reed-Solomon sees a self-consistent codeword and only the CRC objects.
    syms[0] ^= 0b1
    reparityed = list(RSCodec(PROFILES[0], c_exp=BITS).encode(syms[:-PROFILES[0]]))
    with pytest.raises(UndecodableError):
        codec.decode([codec.words[s] for s in reparityed])


# ---- fixed-width mode -----------------------------------------------------

@pytest.mark.parametrize("width", [1, 7, 11, 16, 20, 22, 33, 64, 128])
def test_fixed_round_trip(width):
    rng = random.Random(f"fixed:{width}")
    for _ in range(20):
        value = rng.getrandbits(width)
        assert decode_fixed(encode_fixed(value, width), width) == value


@pytest.mark.parametrize("width", [11, 16, 22, 64])
def test_fixed_extremes(width):
    for value in (0, 1, (1 << width) - 1):
        assert decode_fixed(encode_fixed(value, width), width) == value


def test_fixed_corrects_one_substitution():
    rng = random.Random("fixed-sub")
    for _ in range(40):
        value = rng.getrandbits(22)
        words = encode_fixed(value, 22)
        words[rng.randrange(len(words))] = rng.choice(WORDS)
        assert decode_fixed(words, 22) == value


def test_fixed_corrects_two_erasures():
    rng = random.Random("fixed-era")
    for _ in range(40):
        value = rng.getrandbits(22)
        words = encode_fixed(value, 22)
        for i in rng.sample(range(len(words)), 2):
            words[i] = "???"
        assert decode_fixed(words, 22) == value


def test_fixed_rejects_oversized_value():
    with pytest.raises(ValueError):
        encode_fixed(1 << 22, 22)


def test_fixed_rejects_wrong_word_count():
    words = encode_fixed(99, 22)
    with pytest.raises(UndecodableError):
        decode_fixed(words[:-1], 22)


def test_fixed_unknown_word_is_an_erasure_not_a_keyerror():
    """The original raised a bare KeyError here."""
    words = encode_fixed(4242, 22)
    words[0] = "definitelynotaword"
    assert decode_fixed(words, 22) == 4242


def test_fixed_rejects_invalid_width():
    with pytest.raises(ValueError):
        encode_fixed(0, 0)


# ---- alphabet -------------------------------------------------------------

def test_alphabet_must_be_the_right_size():
    with pytest.raises(AlphabetError):
        Codec(["word"] * 100)


def test_alphabet_must_not_repeat():
    with pytest.raises(AlphabetError):
        Codec(["word"] * 2048)


def test_custom_alphabet_works():
    a = "abcdefghijklmnopqrstuvwxyz"
    words = [f"z{a[i // 676]}{a[(i // 26) % 26]}{a[i % 26]}" for i in range(2048)]
    codec = Codec(words)
    assert codec.decode(codec.encode(b"custom")) == b"custom"


def test_alphabet_must_be_alphabetic():
    with pytest.raises(AlphabetError):
        Codec([f"w{i:04d}" for i in range(2048)])


def test_default_alphabet_has_unique_four_char_prefixes():
    """Relied on by near-miss resolution; assert it rather than assume it."""
    prefixes = {w[:4] for w in WORDS}
    assert len(prefixes) == len(WORDS)


# ---- crc ------------------------------------------------------------------

def test_crc16_matches_the_ccitt_false_check_vector():
    assert _crc16(b"123456789") == 0x29B1
