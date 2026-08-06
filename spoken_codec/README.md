# Spoken codec

Arbitrary bytes to a short list of words that survive being read aloud, and
back again.

```python
from spoken_codec import encode, decode

words = encode(b"hello world")
# ['door', 'half', 'clock', 'brand', 'tattoo', 'alter', 'response',
#  'situate', 'milk', 'water', 'scale', 'cement', 'sell', 'summer', 'denial']

decode(words)                                    # b'hello world'
decode("door half clock brand tattoo ...")       # also fine
```

Each word carries 11 bits, drawn from a 2048-word alphabet. Reed-Solomon over
GF(2^11) supplies the parity, so the correction works on whole words rather
than on bits, which is the unit the channel actually damages.

## The channel

Someone reads words aloud; someone else writes them down. That produces three
kinds of damage, and they do not cost the same:

| damage | what happened | position | cost |
|---|---|---|---|
| substitution | a word became a *different alphabet word* — "ball" → "call" | unknown | 2 units |
| erasure | a word came through as nothing usable — a mumble, a blank | known | 1 unit |
| sync loss | a word was dropped, or an extra one written down | — | search |

A profile buys `nsym` units of parity, and the budget is
`2 * substitutions + erasures <= nsym`.

Erasures being half price is the whole reason to surface them. When a listener
writes down something that is not in the alphabet, that is not a failure — it
is the *good* case, because the position is known. Handing that position to the
decoder rather than discarding it roughly doubles what a given profile
survives.

## Profiles

| profile | parity | substitutions | erasures | 16-byte payload |
|---|---|---|---|---|
| 0 | 2 | 1 | 2 | 17 words |
| 1 (default) | 4 | 2 | 4 | 19 words |
| 2 | 8 | 4 | 8 | 23 words |
| 3 | 16 | 8 | 16 | 31 words |

```python
encode(payload, profile=2)      # more parity for a noisier room
```

The receiver does not need to be told which profile was used; it is in the
frame, and every candidate reading is checked before it is returned.

## Failing loudly

Reed-Solomon past its capacity does not politely give up. It will sometimes
"correct" the damage into a different, perfectly well-formed codeword and hand
back bytes that were never sent. Measured on this codec's own frames at
profile 0, that happened on roughly **0.9%** of frames carrying one more
substitution than the parity covers.

For a codec whose entire job is to move data through a human, silently wrong
output is the worst available failure. So every frame carries a CRC-16 over its
header and payload, checked after correction. Across 12,000 over-damaged frames
spanning all four profiles, the hardened codec returned wrong bytes **zero**
times — the same damage now raises `UndecodableError`.

The checksum pays for itself twice: it is also what makes the sync-loss search
safe. Guessing where a word went missing is only reasonable if a wrong guess
can be recognised and thrown away.

## What it recovers

Measured, not asserted — see `tests/test_codec.py`.

- **Erasures** up to `nsym`, at 100% up to the limit and a clean failure past it.
- **Substitutions** up to `nsym // 2`, likewise.
- **Near misses.** "abandonned" resolves to "abandon" before any parity is
  spent, when the neighbour is unambiguous. Three misspellings in a profile-0
  frame — which has no slack at all — still decode.
- **One dropped or inserted word**, at any position, at any payload size. This
  is a search: reinsert or remove a word at each position and keep the
  candidate that passes the CRC.

Sync repair only runs after a straight decode fails, and only on the failure
path does it cost anything. A repair that works lands in milliseconds; a frame
that is genuinely unrecoverable costs up to about a second at the maximum
511-byte payload, bounded by `REPAIR_BUDGET`. Pass `repair=False` to skip it.

## Frame format

```
symbol 0     2 bits profile | 9 bits payload length (0-511)
symbols 1..  payload bytes, then CRC-16/CCITT-FALSE over (profile, length, payload)
             zero-padded to the symbol boundary
tail         nsym Reed-Solomon parity symbols
```

A decoded frame must claim the profile that decoded it, occupy exactly the
number of symbols its length implies, and match its CRC. All three are checked.

## Fixed-width mode

When both sides agree the width in advance, the header is dead weight:

```python
from spoken_codec import encode_fixed, decode_fixed

encode_fixed(1234567, width_bits=22)     # 4 words: 2 payload, 2 parity
decode_fixed(words, width_bits=22)       # 1234567
```

Cheaper, but there is no CRC and little to give a bad decode away — only the
padding bits, and only when the width is not a multiple of 11. Prefer the
header mode unless the word count really matters.

## Alphabet

The default is the BIP-39 English list, in `alphabet.txt`. Any 2048-word
alphabetic list works:

```python
from spoken_codec import Codec
codec = Codec.from_file("my-words.txt")
```

or set `SPOKEN_ALPHABET` to a path.

The alphabet is worth choosing deliberately, because it sets the rate at which
a mishearing becomes a *substitution* rather than an *erasure* — the expensive
kind of damage. BIP-39 was designed for typing, and it guarantees that four
characters identify a word uniquely, which this codec exploits for near-miss
recovery. It was not designed for a noisy room, and it shows:

```
$ python -m spoken_codec.analyze_alphabet spoken_codec/alphabet.txt
spelling near-misses     806 pairs one edit apart
    ball  call
    ball  fall
    ball  wall
    base  case
    ...
```

Those pairs are exactly the mishearings that produce a valid wrong word. The
analyser scores any candidate list on that count, on phonetic collisions, and
on length and syllable spread, so alternatives can be compared before adoption.
Swapping the alphabet is a wire-format change: both ends must use the same list.

## Requirements

`reedsolo`. Tests need `pytest`.

```bash
pip install reedsolo pytest
python -m pytest spoken_codec/tests/ -q
```
