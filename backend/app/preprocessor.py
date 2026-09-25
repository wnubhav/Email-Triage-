import re
from html.parser import HTMLParser

MAX_BODY_CHARS = 3000   # token budget before the model call
MAX_LOG_LINES  = 40     # keep only first N lines of a log dump


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def get_text(self):
        return " ".join(self.parts)


def _strip_html(text: str) -> str:
    s = _HTMLStripper()
    s.feed(text)
    return s.get_text()


# Patterns that indicate quoted/previous thread content
_THREAD_PATTERNS = [
    re.compile(r"^>.*$", re.MULTILINE),
    re.compile(r"On .+wrote:\s*$", re.MULTILINE | re.DOTALL),
    re.compile(r"-{3,}Original Message-{3,}.*", re.DOTALL),
    re.compile(r"From:.*Sent:.*To:.*Subject:.*", re.DOTALL),
]

# Hex dump / stack trace truncation: keep first MAX_LOG_LINES lines
_HEX_CHARS = frozenset("0123456789abcdefABCDEF")


def _looks_like_hex_dump(line: str) -> bool:
    r"""
    True when a line holds four or more consecutive whitespace-separated hex
    groups of at least four characters, which is the shape of a register or
    memory dump.

    This is a single linear pass rather than the equivalent regular
    expression. `([0-9a-fA-F]{4,}\s+){4,}` backtracks catastrophically on a
    long unbroken run of hex characters: the engine retries from every offset,
    so cost grows with the square of the line length. A 32 KB inline blob (a
    pasted core dump, an embedded attachment) held a request for seconds, and
    a megabyte of it stalled indefinitely. Scanning once cannot backtrack.
    """
    run = 0
    i, n = 0, len(line)
    while i < n:
        start = i
        while i < n and line[i] in _HEX_CHARS:
            i += 1
        token_len = i - start

        ws_start = i
        while i < n and line[i].isspace():
            i += 1
        followed_by_space = i > ws_start

        if token_len >= 4 and followed_by_space:
            run += 1
            if run >= 4:
                return True
        else:
            run = 0
            if i == start:          # no hex and no space here: step over it
                i += 1
    return False


def _trim_log_dump(text: str) -> str:
    lines = text.splitlines()
    log_start = None
    for i, line in enumerate(lines):
        if _looks_like_hex_dump(line):
            log_start = i
            break
    if log_start is not None:
        kept = lines[:log_start + MAX_LOG_LINES]
        truncated = len(lines) - len(kept)
        if truncated > 0:
            kept.append(f"[… {truncated} lines truncated by preprocessor]")
        return "\n".join(kept)
    return text


def preprocess(raw: str) -> str:
    text = _strip_html(raw)

    # Remove quoted thread history
    for pattern in _THREAD_PATTERNS:
        text = pattern.sub("", text)

    text = _trim_log_dump(text)

    # Collapse excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    # Hard truncate for token budget
    if len(text) > MAX_BODY_CHARS:
        text = text[:MAX_BODY_CHARS] + "\n[… truncated by preprocessor]"

    return text
