// Executive summary generation. Calls the Anthropic API when a key is
// configured, passing ONLY the computed metrics JSON (never raw files).
// Falls back to a deterministic template — the app must fully work with
// ANTHROPIC_API_KEY unset.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function pctLabel(value, digits = 1) {
  return `${(Math.abs(value) * 100).toFixed(digits)}%`;
}

function templateNarrative(metrics) {
  const { kpi, alerts, currentWeek } = metrics;
  const sentences = [];

  const correlationAlert = alerts.find((a) => a.key === 'supply_driven_correlation');
  // The correlation window looks back 13 weeks, so it can still be "firing"
  // even after this week's sales have recovered — don't call it "this
  // week's decline" unless L1W itself is actually down.
  const isCurrentWeekDeclining = kpi.l1wPosDollarsChgVsLY !== null && kpi.l1wPosDollarsChgVsLY < 0;
  const correlationIsOngoing = correlationAlert
    && (isCurrentWeekDeclining || (correlationAlert.weeks || []).includes(currentWeek));

  if (kpi.l1wPosDollarsChgVsLY !== null) {
    const dir = kpi.l1wPosDollarsChgVsLY >= 0 ? 'up' : 'down';
    sentences.push(`This week's sales were ${dir} ${pctLabel(kpi.l1wPosDollarsChgVsLY)} versus last year.`);
  }

  if (correlationIsOngoing) {
    sentences.push('This decline lines up with a drop in in-stock availability, which suggests the issue is supply, not softer demand.');
  } else if (correlationAlert) {
    sentences.push('A recent supply-driven dip in in-stock availability affected sales in prior weeks — supply, not softer demand, was the cause — though sales have since recovered.');
  }

  const otherFlags = alerts.filter(
    (a) => a.severity === 'flag' && a.key !== 'supply_driven_correlation' && a.key !== 'pos_decline_flag',
  );
  if (otherFlags.length > 0) {
    sentences.push(otherFlags.map((a) => a.message).join(' '));
  }

  if (kpi.l1wInstockPct !== null && !correlationIsOngoing) {
    sentences.push(`In-stock is currently ${pctLabel(kpi.l1wInstockPct, 1)} (as a share of the 100% target).`);
  }

  if (alerts.length === 0) {
    sentences.push('No significant flags this week — performance is tracking as expected.');
  }

  return sentences.join(' ');
}

export async function generateNarrative(metrics, { apiKey } = {}) {
  if (!apiKey) {
    return { text: templateNarrative(metrics), source: 'template' };
  }

  const prompt = [
    'Write a 3-5 sentence executive summary of this week\'s retail sales report for a non-analyst business reader.',
    'Rules: plain business English, no jargon, no raw spreadsheet column names, lead with the single most important fact, at most 120 words total.',
    'If the alerts array contains an entry with key "supply_driven_correlation", explicitly state that the sales decline appears supply-driven, not demand-driven. IMPORTANT: that alert looks back over a 13-week window and may reference a dip from several weeks ago, not necessarily the current week — check kpi.l1wPosDollarsChgVsLY (and whether currentWeek appears in that alert\'s "weeks" array) before calling it "this week\'s decline"; if the current week is flat or up, describe the supply issue as a recent-but-resolved event instead, never as a contradiction of the current week\'s actual direction.',
    'Use ONLY the metrics JSON below as source material for numbers — never invent figures.',
    '',
    JSON.stringify(metrics),
  ].join('\n');

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API returned HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error('Anthropic API returned no text content');
    return { text, source: 'anthropic' };
  } catch (err) {
    // Never fail report generation because narrative generation failed.
    return { text: templateNarrative(metrics), source: 'template', error: String(err.message || err) };
  }
}
