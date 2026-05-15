export const WORKFLOW_TAGS = [
  {
    name: "needs-review",
    label: "Needs Review",
    color: "#ef4444",
    description: "Items that should be investigated next.",
  },
  {
    name: "root-cause-found",
    label: "Root Cause Found",
    color: "#3b82f6",
    description: "Investigation identified a defensible explanation.",
  },
  {
    name: "question-change-candidate",
    label: "Question Change Candidate",
    color: "#f59e0b",
    description: "Likely survey wording or flow change candidates.",
  },
  {
    name: "monitoring",
    label: "Monitoring",
    color: "#22c55e",
    description: "Known issue or change being watched over time.",
  },
] as const;

export type WorkflowTagName = (typeof WORKFLOW_TAGS)[number]["name"];

export const WORKFLOW_TAG_NAME_SET = new Set<string>(WORKFLOW_TAGS.map((tag) => tag.name));

export function isWorkflowTagName(value: string): value is WorkflowTagName {
  return WORKFLOW_TAG_NAME_SET.has(value);
}
