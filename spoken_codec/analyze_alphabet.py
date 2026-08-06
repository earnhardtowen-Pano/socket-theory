"""Score a word list for use as a spoken alphabet.

The codec corrects transmission damage, but it cannot undo damage the alphabet
invites. A list where "ball", "call", "fall" and "wall" are all valid words
turns a single misheard consonant into a silent substitution -- the receiver
writes down a real word and spends parity fixing it. A list whose words are
phonetically far apart spends that parity on genuine noise instead.

Run it against any candidate list:

    python -m spoken_codec.analyze_alphabet alphabet.txt
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

VOWELS = set("aeiouy")
_SOUNDEX = {**dict.fromkeys("bfpv", "1"), **dict.fromkeys("cgjkqsxz", "2"),
            **dict.fromkeys("dt", "3"), "l": "4",
            **dict.fromkeys("mn", "5"), "r": "6"}


def soundex(word: str) -> str:
    """Classic Soundex. A blunt instrument, but it catches rhyme collisions."""
    word = word.lower()
    out = word[0].upper()
    last = _SOUNDEX.get(word[0], "")
    for ch in word[1:]:
        code = _SOUNDEX.get(ch, "")
        if code and code != last:
            out += code
        if ch not in "hw":
            last = code
    return (out + "000")[:4]


def one_edit_apart(a: str, b: str) -> bool:
    """True if a single substitution, insertion or deletion turns a into b."""
    if a == b or abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    short, long = (a, b) if len(a) < len(b) else (b, a)
    return any(long[:i] + long[i + 1:] == short for i in range(len(long)))


def syllables(word: str) -> int:
    """Rough vowel-group count. Good enough to compare lists against each other."""
    count, prev_vowel = 0, False
    for ch in word:
        is_vowel = ch in VOWELS
        count += is_vowel and not prev_vowel
        prev_vowel = is_vowel
    return max(1, count - (word.endswith("e") and count > 1))


def analyse(words: list[str]) -> dict:
    by_len = defaultdict(list)
    for w in words:
        by_len[len(w)].append(w)

    edit_pairs = []
    for length, bucket in by_len.items():
        for i, a in enumerate(bucket):
            for b in bucket[i + 1:]:
                if one_edit_apart(a, b):
                    edit_pairs.append((a, b))
        for a in bucket:
            for b in by_len.get(length + 1, ()):
                if one_edit_apart(a, b):
                    edit_pairs.append((a, b))

    sound = defaultdict(list)
    for w in words:
        sound[soundex(w)].append(w)
    collisions = {k: v for k, v in sound.items() if len(v) > 1}

    return {
        "count": len(words),
        "unique": len(set(words)),
        "non_alpha": [w for w in words if not w.isalpha()],
        "lengths": Counter(len(w) for w in words),
        "syllables": Counter(syllables(w) for w in words),
        "prefix4_unique": len({w[:4] for w in words}) == len(words),
        "prefix4_clashes": sum(c - 1 for c in Counter(w[:4] for w in words).values() if c > 1),
        "edit_pairs": edit_pairs,
        "sound_groups": collisions,
        "sound_worst": sorted(collisions.values(), key=len, reverse=True)[:8],
    }


def report(words: list[str]) -> None:
    a = analyse(words)
    n = a["count"]
    print(f"words                    {n}")
    print(f"unique                   {a['unique']}" + ("" if a["unique"] == n else "   <- duplicates"))
    if a["non_alpha"]:
        print(f"non-alphabetic           {len(a['non_alpha'])}   e.g. {a['non_alpha'][:5]}")
    print(f"length range             {min(a['lengths'])}-{max(a['lengths'])}"
          f"  (most common: {a['lengths'].most_common(1)[0][0]})")
    print(f"syllables                " + ", ".join(f"{k}:{v}" for k, v in sorted(a["syllables"].items())))
    prefix = "yes" if a["prefix4_unique"] else f"no, {a['prefix4_clashes']} clashes"
    print(f"unique 4-char prefixes   {prefix}")

    ep = a["edit_pairs"]
    print(f"\nspelling near-misses     {len(ep)} pairs one edit apart "
          f"({100 * min(1.0, 2 * len(ep) / n):.0f}% of the list is involved)")
    for pair in ep[:10]:
        print(f"    {pair[0]:<12} {pair[1]}")
    if len(ep) > 10:
        print(f"    ... and {len(ep) - 10} more")

    sg = a["sound_groups"]
    exposed = sum(len(v) for v in sg.values())
    print(f"\nphonetic collisions      {len(sg)} soundex groups covering {exposed} words "
          f"({100 * exposed / n:.0f}%)")
    for group in a["sound_worst"]:
        print(f"    {', '.join(group)}")

    print("\nThese are not defects to fix in the codec -- they are the rate at which")
    print("this alphabet converts a mishearing into a valid-but-wrong word, which is")
    print("the expensive kind of damage. Compare candidate lists on the two counts above.")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    text = Path(argv[1]).read_text(encoding="utf-8")
    words = [w for w in (line.strip().lower() for line in text.splitlines()) if w]
    report(words)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
