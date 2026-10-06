/**
 * Which high and critical advisories in an `npm audit --json` report we have
 * NOT accepted. `security.yml` fails on any; this is what it counts.
 *
 * "Accepted" means listed in `.osv-scanner.toml`, the one list of reviewed
 * exceptions, so an advisory is accepted (or not) in one place for both of that
 * job's scanners. Before this, the npm audit step had no exceptions at all: on
 * 2026-10-04 an advisory for `braces` with no fixed release (every version up to
 * 3.0.3, reached only through build tooling) turned the job red on every push,
 * with nothing anyone could do about it short of waiting for upstream.
 *
 * An entry whose `ignoreUntil` has passed counts again. An exception for a bug
 * upstream has not fixed yet is a deadline to look again, not a waiver.
 *
 * An unreadable report is "unknown", exactly as before: the registry not
 * answering is a gap in our visibility, not a finding (docs/runbooks/SECURITY.md).
 */

const SEVERE = new Set(["high", "critical"]);

/**
 * The `[[IgnoredVulns]]` entries of an osv-scanner TOML config, as
 * id → expiry (a Date) or null when the entry has no `ignoreUntil`.
 */
export function acceptedAdvisories(toml) {
  const accepted = new Map();
  for (const section of toml.split(/^\s*\[\[IgnoredVulns\]\]\s*$/m).slice(1)) {
    // Stop at the next table, so a later [[PackageOverrides]] is never read as ours.
    const block = section.split(/^\s*\[/m)[0];
    const id = block.match(/^\s*id\s*=\s*"([^"]+)"/m)?.[1];
    if (!id) continue;
    const until = block.match(/^\s*ignoreUntil\s*=\s*"?([^"#\s]+)/m)?.[1];
    // An unparseable date becomes an Invalid Date, which never lies in the
    // future, so a typo expires the entry instead of making it permanent.
    accepted.set(id.toUpperCase(), until === undefined ? null : new Date(until));
  }
  return accepted;
}

/**
 * @param {string} reportText the stdout of `npm audit --json`
 * @param {Map<string, Date | null>} accepted from acceptedAdvisories()
 * @returns {{ count: number | "unknown", accepted: string[], expired: string[] }}
 */
export function unacceptedAdvisories(reportText, accepted, now = new Date()) {
  let report;
  try {
    report = JSON.parse(reportText);
  } catch {
    return { count: "unknown", accepted: [], expired: [] };
  }
  const totals = report?.metadata?.vulnerabilities;
  if (!totals) return { count: "unknown", accepted: [], expired: [] };

  // An advisory appears as an object in the `via` of the package it is filed
  // against; packages that are vulnerable only through it list its name as a
  // string. Collecting the objects counts each advisory once.
  const severe = new Map();
  for (const pkg of Object.values(report.vulnerabilities ?? {})) {
    for (const via of pkg?.via ?? []) {
      if (via && typeof via === "object" && SEVERE.has(via.severity)) {
        const id = String(via.url ?? "").match(/GHSA(-[a-z0-9]{4}){3}$/i)?.[0];
        severe.set(id ? id.toUpperCase() : `npm:${via.source ?? via.name}`, via);
      }
    }
  }

  // The totals say something is high or critical but no advisory object was
  // found: a report shape this does not understand. Fail closed.
  const flagged = (totals.high || 0) + (totals.critical || 0);
  if (flagged > 0 && severe.size === 0) return { count: flagged, accepted: [], expired: [] };

  const result = { count: 0, accepted: [], expired: [] };
  for (const id of severe.keys()) {
    if (!accepted.has(id)) {
      result.count += 1;
    } else if (accepted.get(id) !== null && !(accepted.get(id) > now)) {
      result.expired.push(id);
      result.count += 1;
    } else {
      result.accepted.push(id);
    }
  }
  return result;
}
