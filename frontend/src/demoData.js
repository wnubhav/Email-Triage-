/**
 * Demo dataset, used only when the backend cannot be reached.
 *
 * These are sample EDA support emails, reshaped into the exact
 * response shape of GET /api/emails/{id} so the same components render live
 * and demo data through one code path with no branching.
 *
 * The console labels this state as DEMO in the top bar and disables every
 * action that would write to a database, because in this mode there is none.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Backend timestamps are naive UTC (datetime.utcnow), so match that format. */
function ago(ms) {
  return new Date(Date.now() - ms).toISOString().replace(/\.\d+Z$/, "");
}

const RAW_1 = `<div dir="ltr"><p>Hi team,</p>
<p>We're seeing a consistent SIGSEGV in Virtuoso 23.1.1 whenever we attempt to import the attached netlist. The crash happens reproducibly and is blocking our tape-out scheduled for Friday.</p>
<p>Stacktrace excerpt:</p>
<pre>  #0 0x00007f8a2c3d1234 in VirtuosoCore::NetlistParser::parseNode
  #1 0x00007f8a2c3d5678 in VirtuosoCore::NetlistParser::parse
  #2 0x00007f8a2c3d9abc in VirtuosoCore::NetlistParser::importFile</pre>
<p>We've tried reverting to 22.1 and the import succeeds. This appears to be a regression.</p>
<p>License checkout is failing as well, we suspect the license server may be under load.</p>
<p>Please treat this as critical, tape-out deadline is Friday 5pm IST.</p>
<p>Priya Sharma<br/>Sr. Design Engineer, GlobalFab</p></div>

On Thu, 4 Sep 2025 at 18:22, Cadence Support wrote:
&gt; Thanks for raising this. Could you confirm the exact build number?
&gt; We will need the full log to reproduce internally.`;

const CLEAN_1 = `Hi team,

We're seeing a consistent SIGSEGV in Virtuoso 23.1.1 whenever we attempt to import the attached netlist. The crash happens reproducibly and is blocking our tape-out scheduled for Friday.

Stacktrace excerpt:
  #0 0x00007f8a2c3d1234 in VirtuosoCore::NetlistParser::parseNode
  #1 0x00007f8a2c3d5678 in VirtuosoCore::NetlistParser::parse
  #2 0x00007f8a2c3d9abc in VirtuosoCore::NetlistParser::importFile

We've tried reverting to 22.1 and the import succeeds. This appears to be a regression.

License checkout is failing as well, we suspect the license server may be under load.

Please treat this as critical, tape-out deadline is Friday 5pm IST.

Priya Sharma
Sr. Design Engineer, GlobalFab`;

const CLEAN_2 = `Hi,

Following up on last week's thread. The assertion still fails intermittently. We've narrowed it to the assume statement interaction with the clock gating cell.

Property in question:
assert property (@(posedge clk) disable iff (rst) req |-> ##[1:4] ack);
assume property (@(posedge clk) !gating_en);

Removing the assume resolves the spurious failure, but that's not a real fix. Can someone from the JasperGold team review our constraint setup?

Alex Novak
Verification Lead`;

const CLEAN_3 = `URGENT,

Our FlexNet license server for Cadence Innovus has stopped responding. All 40 engineers are blocked. We cannot run any sign-off jobs.

Server: lmgrd v11.18.1 on CentOS 7
Error from lmstat: Connection refused (port 27000)
Last known good state: yesterday 18:30 IST

We have a customer delivery milestone at EOD today. This is a revenue-impacting issue.

Please escalate immediately.

Ops Team
TechVentures`;

const CLEAN_4 = `Hi,

Attaching our Verilog-A implementation of the BSIM-BULK model. We're seeing a 12% mismatch in parameter extraction in the saturation region compared to SPICE reference.

Suspect the issue is in our Vth0 calculation or the mobility degradation factor. Would appreciate a review of the model equations.

-- Michael Chen`;

const CLEAN_5 = `Hi,

We received the renewal quote (attached) but the Innovus Implementation Suite line item shows $148,000 vs. our contracted rate of $132,000. Can someone from account management clarify?

Rohit Patel
IT Procurement`;

const CLEAN_6 = `Hi,

Running ECO hold fix on a 5nm design. After 12 iterations Innovus is still reporting 847 hold violations (WNS -0.042ns). The tool appears to be in a loop, adding buffers in one domain creates violations in another.

Cmd used: setAnalysisMode -analysisType bcwc; optDesign -hold -outDir ./hold_fix

Log attached. Any known workaround for this convergence issue?

Debug Team
FabricLab`;

function preview(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 180 ? flat : flat.slice(0, 180).trimEnd() + "…";
}

function email({ id, sender, subject, raw, clean, receivedAt, triage }) {
  return {
    id,
    message_id: `demo-${String(id).padStart(3, "0")}@triage.local`,
    sender,
    subject,
    received_at: receivedAt,
    triaged: true,
    preview: preview(clean),
    body_raw: raw ?? clean,
    body_clean: clean,
    triage: { id, email_id: id, created_at: receivedAt, feedback: null, ...triage },
  };
}

export const DEMO_EMAILS = [
  email({
    id: 1,
    sender: "priya.sharma@globalfab.com",
    subject: "Virtuoso crashing on netlist import, full log attached",
    raw: RAW_1,
    clean: CLEAN_1,
    receivedAt: ago(42 * MINUTE),
    triage: {
      category: "Tool Crash / Log Report",
      priority: "P1",
      intent_summary:
        "Reporting a critical SIGSEGV regression in Virtuoso 23.1.1 during netlist import, blocking Friday tape-out. Secondary issue: license checkout failing under server load.",
      suggested_action:
        "Escalate to Virtuoso engineering immediately. Assign a regression ticket against 23.1.1 and check license server health in parallel.",
      confidence: 97,
      similar_issue: "Issue #6: Innovus timing violation, hold fix loop not converging (Tool Crash / Log Report, P2, 46%)",
      jira_payload: {
        title: "Virtuoso 23.1.1 SIGSEGV on netlist import",
        priority: "P1",
        component: "Virtuoso / Parser",
        steps_to_reproduce:
          "1. Open Virtuoso 23.1.1\n2. File → Import Netlist\n3. Select the attached .cdl file\n4. Observe crash during parse",
        expected: "Netlist imports successfully, as it does under 22.1",
        actual: "SIGSEGV at VirtuosoCore::NetlistParser::parseNode",
      },
      draft_reply:
        "Thank you for the detailed report and stack trace. We have escalated this to the Virtuoso engineering team as a P1 regression against 23.1.1 and are reviewing your license server logs in parallel. We will follow up within 2 hours.",
    },
  }),
  email({
    id: 2,
    sender: "alex.novak@chipdesign.eu",
    subject: "Re: JasperGold property failing, need guidance on assertion syntax",
    clean: CLEAN_2,
    receivedAt: ago(1 * HOUR + 5 * MINUTE),
    triage: {
      category: "IP Integration / Design Review",
      priority: "P2",
      intent_summary:
        "Seeking technical guidance on a JasperGold assertion: an assume statement interacting with a clock gating cell causes intermittent property failures.",
      suggested_action:
        "Assign to a JasperGold support engineer. Schedule a session to review the constraint setup before suggesting the assume is removed.",
      confidence: 91,
      similar_issue: "Support case #2204: assume + clock gating spurious failure (JasperGold 2022.09)",
      jira_payload: null,
      draft_reply:
        "Thanks for following up. We are assigning a JasperGold applications engineer to review your constraint setup, since removing the assume would mask the underlying issue rather than resolve it. Expect contact within one business day.",
    },
  }),
  email({
    id: 3,
    sender: "ops@techventures.io",
    subject: "URGENT: License server down, 40 engineers blocked",
    clean: CLEAN_3,
    receivedAt: ago(1 * HOUR + 29 * MINUTE),
    triage: {
      category: "License Server Escalation",
      priority: "P1",
      intent_summary:
        "The FlexNet license server for Innovus is completely down, blocking 40 engineers with a customer delivery milestone due at end of day.",
      suggested_action:
        "Immediate escalation to license operations. Verify lmgrd process state, restart the daemon, and confirm port 27000 is reachable from the client subnet.",
      confidence: 99,
      similar_issue: null,
      jira_payload: null,
      draft_reply:
        "We have escalated this to license operations as a P1 outage. An engineer is checking the lmgrd process and port 27000 reachability now, and will contact your ops team directly within 30 minutes.",
    },
  }),
  email({
    id: 4,
    sender: "m.chen@analogdesigns.com",
    subject: "Verilog-A model review request: BSIM-BULK transistor model",
    clean: CLEAN_4,
    receivedAt: ago(27 * HOUR),
    triage: {
      category: "IP Integration / Design Review",
      priority: "P3",
      intent_summary:
        "Requesting a code review of a Verilog-A BSIM-BULK model implementation showing a 12% parameter extraction mismatch in the saturation region.",
      suggested_action: "Assign to the AMS modeling team for review. Estimated 2–3 day turnaround; no escalation required.",
      confidence: 88,
      similar_issue: "Support ticket #3812: Verilog-A BSIM mismatch in saturation (resolved: Vth0 sign error)",
      jira_payload: null,
      draft_reply:
        "Thank you for sending the model. We have queued this with our AMS modeling team for review of the Vth0 calculation and mobility degradation factor, with an expected turnaround of 2–3 business days.",
    },
  }),
  email({
    id: 5,
    sender: "r.patel@semiconductor.in",
    subject: "Invoice query: license renewal Q3 FY26",
    clean: CLEAN_5,
    receivedAt: ago(29 * HOUR),
    triage: {
      category: "General / Admin",
      priority: "P4",
      intent_summary:
        "Pricing discrepancy on a license renewal invoice: $148,000 quoted against a contracted rate of $132,000.",
      suggested_action: "Forward to account management. No engineering action required.",
      confidence: 94,
      similar_issue: null,
      jira_payload: null,
      draft_reply:
        "Thank you for flagging the discrepancy. We have forwarded the quote to your account management contact, who will reconcile it against your contracted rate and respond within one business day.",
    },
  }),
  email({
    id: 6,
    sender: "debug@fabriclab.net",
    subject: "Innovus timing violation, hold fix loop not converging",
    clean: CLEAN_6,
    receivedAt: ago(4 * 24 * HOUR),
    triage: {
      category: "Tool Crash / Log Report",
      priority: "P2",
      intent_summary:
        "Innovus ECO hold-fix is not converging after 12 iterations on a 5nm design; buffer insertion in one voltage domain creates violations in another.",
      suggested_action:
        "Assign to the Innovus timing team. Review the log for inter-domain coupling and evaluate path-group isolation before further ECO iterations.",
      confidence: 86,
      similar_issue: "Issue #1: Virtuoso crashing on netlist import, full log attached (Tool Crash / Log Report, P1, 46%)",
      jira_payload: {
        title: "Innovus hold-fix ECO loop: 5nm design, 847 residual violations",
        priority: "P2",
        component: "Innovus / Timing ECO",
        steps_to_reproduce:
          "1. Load the 5nm design database\n2. setAnalysisMode -analysisType bcwc\n3. optDesign -hold -outDir ./hold_fix\n4. Observe non-convergence after 12 iterations",
        expected: "Hold violations resolved within approximately 5 iterations",
        actual: "847 violations remain; WNS -0.042ns, buffers oscillating between voltage domains",
      },
      draft_reply:
        "Thanks for the log. We have routed this to the Innovus timing team to investigate the cross-domain buffer oscillation you are seeing, and will come back with a recommended path-group strategy.",
    },
  }),
];

/** Aggregates computed from the demo set, matching the /api/stats shape. */
export function demoStats() {
  const triages = DEMO_EMAILS.map((e) => e.triage);
  const by_priority = {};
  const by_category = {};
  for (const t of triages) {
    by_priority[t.priority] = (by_priority[t.priority] || 0) + 1;
    by_category[t.category] = (by_category[t.category] || 0) + 1;
  }
  return {
    total_triaged: triages.length,
    by_priority,
    by_category,
    avg_confidence: Math.round((triages.reduce((a, t) => a + t.confidence, 0) / triages.length) * 10) / 10,
    feedback_accuracy: null,
    reviewed_count: 0,
    corrections_count: 0,
  };
}
