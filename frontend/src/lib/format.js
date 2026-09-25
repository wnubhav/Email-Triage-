/**
 * Domain helpers for the triage console.
 *
 * Everything here is derived from data the backend actually returns: priority
 * codes from the model's response schema, the similar-issue string built by
 * similarity.py, and the raw/clean body pair produced by preprocessor.py.
 */

/* ── priority ─────────────────────────────────────────────────────────
 * Priority is never signalled by colour alone. Each level also carries a
 * distinct rail treatment, a type weight and a written label, so the ladder
 * survives greyscale, low vision and colour-blind viewing.
 */
export const PRIORITIES = ["P1", "P2", "P3", "P4"];

export const PRIORITY_META = {
  P1: {
    code: "P1",
    label: "Critical",
    note: "Production blocked / tape-out at risk",
    rail: "solid",
    weight: 600,
    bright: true,
  },
  P2: {
    code: "P2",
    label: "High",
    note: "Significant engineering impact",
    rail: "solid",
    weight: 550,
    bright: true,
  },
  P3: {
    code: "P3",
    label: "Normal",
    note: "Technical question / routine review",
    rail: "half",
    weight: 450,
    bright: false,
  },
  P4: {
    code: "P4",
    label: "Low",
    note: "Admin, information request",
    rail: "dotted",
    weight: 400,
    bright: false,
  },
};

export function priorityMeta(p) {
  return (
    PRIORITY_META[p] || {
      code: p || "-",
      label: "Untriaged",
      note: "Not yet classified",
      rail: "none",
      weight: 400,
      bright: false,
    }
  );
}

/* ── categories ───────────────────────────────────────────────────────
 * Short codes let a dense queue row carry the category without a pill.
 * The five categories mirror the model's response schema exactly.
 */
export const CATEGORIES = [
  "Tool Crash / Log Report",
  "License Server Escalation",
  "IP Integration / Design Review",
  "Bug / Jira Ticket",
  "General / Admin",
];

export const CATEGORY_META = {
  "Tool Crash / Log Report": { label: "Tool crash", short: "CRASH", tone: "crash" },
  "License Server Escalation": { label: "License", short: "LICENSE", tone: "license" },
  "IP Integration / Design Review": { label: "Design review", short: "DESIGN", tone: "design" },
  "Bug / Jira Ticket": { label: "Bug", short: "BUG", tone: "bug" },
  "General / Admin": { label: "Admin", short: "ADMIN", tone: "admin" },
};

export function categoryMeta(c) {
  return (
    CATEGORY_META[c] || {
      label: c || "Untriaged",
      short: (c || "-").slice(0, 7).toUpperCase(),
      tone: "admin",
    }
  );
}

/* ── time ─────────────────────────────────────────────────────────────
 * received_at comes from datetime.utcnow() and serialises without a timezone
 * marker, so it is read as UTC rather than as local time.
 */
export function parseTimestamp(value) {
  if (!value) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : value + "Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWhen(value) {
  const date = parseTimestamp(value);
  if (!date) return { short: "-", full: "unknown", iso: null };

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const daysApart = Math.floor((now - date) / 86400000);

  let short;
  if (sameDay) {
    short = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } else if (daysApart < 7) {
    short = date.toLocaleDateString([], { weekday: "short" });
  } else {
    short = date.toLocaleDateString([], { day: "2-digit", month: "short" });
  }

  return {
    short,
    full: date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    iso: date.toISOString(),
  };
}

/* ── sender ─────────────────────────────────────────────────────────── */
export function senderParts(sender) {
  const value = sender || "";
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const address = match ? match[2] : value.trim();
  const at = address.indexOf("@");
  const local = at === -1 ? address : address.slice(0, at);
  const domain = at === -1 ? "" : address.slice(at + 1);
  const name = match && match[1] ? match[1] : local.replace(/[._]+/g, " ");
  return { name, address, domain };
}

/* ── confidence ───────────────────────────────────────────────────────
 * One set of bands, used by both the queue and the triage panel, so a value
 * never reads as "high" in one place and "moderate" in another.
 */
export function confidenceBand(value) {
  if (value >= 90) return { key: "high", label: "High" };
  if (value >= 75) return { key: "medium", label: "Moderate" };
  return { key: "low", label: "Low, verify" };
}

/* ── similar issue ────────────────────────────────────────────────────
 * similarity.py returns:  "Issue #12: Subject line (Category, P1, 91%)"
 * The score is optional, so rows stored before it was added still parse.
 * Parsed back into fields so the match renders structurally and links to the
 * email it points at. Unrecognised strings render verbatim instead.
 */
const SIMILAR_RE = /^Issue\s+#(\d+)\s*[:\u2014-]\s*(.*?)\s*\(([^,()]+),\s*(P\d)(?:,\s*(\d+)\s*%)?\)\s*$/;

export function parseSimilar(text) {
  if (!text) return null;
  const match = text.match(SIMILAR_RE);
  if (!match) {
    return { raw: text, emailId: null, subject: text, category: null, priority: null, score: null };
  }
  return {
    raw: text,
    emailId: Number(match[1]),
    subject: match[2],
    category: match[3].trim(),
    priority: match[4],
    score: match[5] ? Number(match[5]) : null,
  };
}

/* ── preprocessor delta ───────────────────────────────────────────────
 * What preprocess() actually stripped: HTML tags, quoted thread history,
 * over-long log dumps, and the 3000-character token budget cap.
 */
export function preprocessDelta(raw, clean) {
  if (typeof raw !== "string" || typeof clean !== "string") return null;
  const removed = raw.length - clean.length;
  return {
    rawChars: raw.length,
    cleanChars: clean.length,
    removed,
    percent: raw.length ? Math.round((removed / raw.length) * 100) : 0,
    truncated: /truncated by preprocessor/.test(clean),
  };
}

/* ── technical content detection ──────────────────────────────────────
 * Stack traces, SystemVerilog assertions, FlexNet diagnostics and tool
 * command lines earn monospace treatment; ordinary prose does not. Each line
 * is classified, then adjacent technical lines are grouped into one block.
 */
/* Classification is by SHAPE, not by topic. A sentence that mentions SIGSEGV
 * or lmgrd is still an English sentence and belongs in prose; what earns
 * monospace is the structure of code, a stack frame, or a log field. */
const STRUCTURAL_PATTERNS = [
  /^\s*#\d+\s+0x[0-9a-f]+/i, //                       gdb stack frame
  /0x[0-9a-f]{6,}/i, //                                hex address
  /\b[A-Za-z_]\w*::[A-Za-z_]\w*/, //                   C++ scope resolution
  /^\s*(assert|assume|cover)\s+property\b/i, //        SystemVerilog assertion
  /@\(\s*(pos|neg)edge\b/i, //                         clocking expression
  /^\s*(module|endmodule|always(_ff|_comb)?|wire|reg|logic|parameter|localparam|input|output|inout|analog)\b/,
  /^\s*(\*{2}\s*)?(error|warning|fatal|severe|info|debug)\b\s*[:\-[]/i, // log level prefix
  /(?:^|\s)[a-z][\w.-]{2,}\s+-{1,2}[A-Za-z][\w-]+/, // tool invocation with flags
];

/* A log/diagnostic field line: "Server: lmgrd v11.18.1 on CentOS 7". Short,
 * and without the terminal punctuation that would make it a sentence. */
const FIELD_LINE = /^\s*[A-Za-z][\w ./-]{1,28}[:=]\s*\S/;
const MAX_FIELD_LINE = 110;

/* A technical line is short and dense. Prose that merely mentions a version
 * number or a C++ symbol is still prose, which matters because the HTML
 * stripper in preprocessor.py joins tags with spaces, so an HTML email arrives
 * as a handful of very long lines rather than as paragraphs. */
const MAX_TECHNICAL_LINE = 200;
const MULTI_SENTENCE = /[.!?]\s+[A-Z].*[.!?]\s+[A-Z]/;
/* Not a boundary after a common abbreviation: "Priya Sharma Sr. Design
 * Engineer" is one signature line, not two sentences. */
const SENTENCE_BOUNDARY =
  /(?<!\b(?:Mr|Mrs|Ms|Dr|Sr|Jr|St|Inc|Ltd|Co|Corp|vs|etc|approx|dept|ver|rev|Fig|No|Rd|Ave)\.)(?<=[.!?])\s+(?=[A-Z])/;

function isTechnicalLine(line) {
  const text = line.trim();
  if (!text) return false;
  // Long, multi-sentence runs are prose whatever tokens they contain.
  if (text.length > MAX_TECHNICAL_LINE || MULTI_SENTENCE.test(text)) return false;
  if (STRUCTURAL_PATTERNS.some((re) => re.test(text))) return true;
  return FIELD_LINE.test(text) && text.length <= MAX_FIELD_LINE && !/[.!?]$/.test(text);
}

/* Flattened HTML paragraphs are reasoned about sentence by sentence, so a
 * stack frame that ended up glued to a paragraph is still recognised. */
function explode(lines) {
  const out = [];
  for (const line of lines) {
    if (line.length > MAX_TECHNICAL_LINE) out.push(...line.split(SENTENCE_BOUNDARY));
    else out.push(line);
  }
  return out;
}

/**
 * Split an email body into prose and technical blocks.
 * @returns {{type: "prose"|"technical", lines: string[]}[]}
 */
export function segmentBody(body) {
  if (!body) return [];
  const lines = explode(body.replace(/\r\n/g, "\n").split("\n"));
  const flags = lines.map(isTechnicalLine);

  // A blank line inside a technical run stays technical if the run continues.
  for (let i = 1; i < lines.length - 1; i += 1) {
    if (!lines[i].trim() && flags[i - 1] && flags[i + 1]) flags[i] = true;
  }

  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const type = flags[i] ? "technical" : "prose";
    const last = blocks[blocks.length - 1];
    if (last && last.type === type) last.lines.push(lines[i]);
    else blocks.push({ type, lines: [lines[i]] });
  }

  // Drop whitespace-only blocks, and trim blank edges off the rest.
  return blocks
    .map((block) => {
      const kept = block.lines.slice();
      while (kept.length && !kept[0].trim()) kept.shift();
      while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
      return { type: block.type, lines: kept };
    })
    .filter((block) => block.lines.length > 0);
}

/* ── observable signals ───────────────────────────────────────────────
 * Terms that are actually present in the email, matched against a fixed EDA
 * vocabulary. This is evidence the operator can check against the message in
 * the next panel, not an account of how the model reasoned: the model is never
 * asked to explain itself, and nothing here is inferred.
 */
const SIGNAL_TERMS = [
  // failure modes
  ["SIGSEGV", /\bSIGSEGV\b/i],
  ["SIGABRT", /\bSIGABRT\b/i],
  ["core dump", /\bcore dump(ed)?\b/i],
  ["stack trace", /\b(stack ?trace|backtrace)\b|^\s*#\d+\s+0x/im],
  ["crash", /\bcrash(es|ed|ing)?\b/i],
  ["hang", /\bhang(s|ing)?\b|\bnot responding\b/i],
  ["regression", /\bregress(ion|ed)\b/i],
  ["memory leak", /\bmemory leak\b/i],
  // tools
  ["Virtuoso", /\bVirtuoso\b/i],
  ["Innovus", /\bInnovus\b/i],
  ["JasperGold", /\bJasper ?Gold\b/i],
  ["Spectre", /\bSpectre\b/i],
  ["Xcelium", /\bXcelium\b/i],
  ["Genus", /\bGenus\b/i],
  ["Conformal", /\bConformal\b/i],
  // licensing
  ["FlexNet", /\b(FlexNet|flexlm)\b/i],
  ["lmgrd", /\blmgrd\b/i],
  ["license checkout", /\blicen[cs]e (checkout|server)\b|\blmstat\b/i],
  // design and flow
  ["netlist import", /\bnetlist\b/i],
  ["assertion", /\bassert(ion)?\b|\bassume property\b/i],
  ["Verilog-A", /\bVerilog-?A\b/i],
  ["timing violation", /\b(timing|hold|setup) violation|\bWNS\b|\bTNS\b/i],
  ["ECO", /\bECO\b/],
  ["sign-off", /\bsign-?off\b/i],
  // urgency
  ["tape-out", /\btape-?out\b/i],
  ["deadline", /\bdeadline\b|\bEOD\b|\bmilestone\b/i],
  ["engineers blocked", /\bblock(ed|ing)\b/i],
  ["revenue impact", /\brevenue\b/i],
  ["SLA", /\bSLA\b/],
  // admin
  ["invoice", /\binvoice\b/i],
  ["renewal", /\brenewal\b|\bquote\b/i],
];

const MAX_SIGNALS = 6;

/**
 * Terms from the EDA vocabulary that appear in this email.
 * @returns {string[]} at most MAX_SIGNALS labels, in vocabulary order
 */
export function extractSignals(...parts) {
  const text = parts.filter(Boolean).join("\n");
  if (!text.trim()) return [];
  const found = [];
  for (const [label, pattern] of SIGNAL_TERMS) {
    if (pattern.test(text)) found.push(label);
    if (found.length >= MAX_SIGNALS) break;
  }
  return found;
}

/* ── misc ─────────────────────────────────────────────────────────── */
export function pluralise(n, singular, plural) {
  const word = n === 1 ? singular : plural || singular + "s";
  return n + " " + word;
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}
