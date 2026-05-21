export interface IncidentCorrelationDriver {
  kind: "release" | "decision" | "experiment" | "annotation";
  title: string;
  detail: string;
  date: string;
  href: string;
}

export interface IncidentCorrelationEntry {
  id: string;
  severity: "risk" | "watch";
  category: string;
  title: string;
  currentSignal: string;
  confidence: "high" | "medium" | "low";
  ownerEmail: string | null;
  metricKey: string | null;
  suspectedDrivers: IncidentCorrelationDriver[];
  recommendation: string;
}

export interface IncidentCorrelationSnapshot {
  generatedAt: string;
  days: number;
  summary: {
    incidents: number;
    highConfidence: number;
    releaseLinked: number;
    trackingOrService: number;
  };
  entries: IncidentCorrelationEntry[];
}
