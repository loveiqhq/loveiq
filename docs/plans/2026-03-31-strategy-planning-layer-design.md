# Strategy Planning Layer Design

## Goal

Add a strategy planning layer to the existing admin so leadership can connect goals, initiatives, bets, competition, and metric dependencies in one operating surface.

This should close the current gap between:

- analytics and monitoring
- decisions and reviews
- actual strategic planning and ownership

## Scope

This slice adds four capabilities:

- goal-to-initiative mapping
- strategic bets tracker
- competitive watch panel
- cross-metric dependency map

The implementation should extend the current strategy hub instead of creating a separate planning product.

## Why This Slice Next

The admin already has:

- command center
- role cockpits
- anomaly center
- metric registry
- metric impact tracking
- review queue
- weekly operating review

What is still missing is the planning layer that answers:

- Which initiatives are supposed to move a goal?
- Which strategic bets are active and how risky are they?
- What market moves matter to us?
- Which canonical metrics drive other metrics?

## Approach Options

### Option 1: Add planning into the current strategy hub

Add a new `Strategy Planning` tab to the strategy hub and back it with new Supabase tables and APIs.

Pros:

- reuses the strongest existing strategy surface
- keeps planning adjacent to goals, opportunities, releases, and guardrails
- lowest navigation and cognitive overhead

Cons:

- strategy hub becomes denser

### Option 2: Create a separate planning section

Create a dedicated `/admin/strategy-planning` page with its own navigation item.

Pros:

- cleaner separation
- more room for future expansion

Cons:

- fragments the strategy workflow
- weaker integration with existing strategy analytics

### Option 3: Add planning only to the command center

Expose planning cards in the command center and skip a deeper strategy surface.

Pros:

- fastest to ship

Cons:

- too shallow
- does not solve the real modeling gap

## Recommendation

Use Option 1.

This keeps strategy planning next to the existing strategy system and gives the best leverage with the least surface-area sprawl.

## Data Model

### `admin_strategy_initiative`

Tracks strategic initiatives linked to goals and canonical metrics.

Fields:

- `id`
- `admin_email`
- `title`
- `description`
- `status`
- `priority`
- `owner_email`
- `goal_id`
- `primary_metric_key`
- `secondary_metric_keys`
- `expected_impact`
- `review_date`
- `linked_href`
- `created_at`
- `updated_at`

### `admin_strategy_bet`

Tracks strategic bets and leadership hypotheses.

Fields:

- `id`
- `admin_email`
- `title`
- `hypothesis`
- `status`
- `confidence`
- `upside_note`
- `downside_note`
- `primary_metric_key`
- `review_date`
- `owner_email`
- `decision_note`
- `created_at`
- `updated_at`

### `admin_competitive_watch`

Tracks competitor and market signals that may affect goals or roadmap.

Fields:

- `id`
- `admin_email`
- `competitor_name`
- `move_type`
- `title`
- `detail`
- `impact_level`
- `primary_metric_key`
- `recommended_response`
- `source_href`
- `observed_at`
- `created_at`
- `updated_at`

### `admin_metric_dependency`

Tracks directional relationships between canonical metrics.

Fields:

- `id`
- `admin_email`
- `parent_metric_key`
- `child_metric_key`
- `relationship_strength`
- `hypothesis_note`
- `evidence_note`
- `created_at`
- `updated_at`

## API Shape

### `GET /api/admin/strategy-planning`

Returns:

- summary counts
- initiatives
- bets
- competitive watch items
- metric dependencies
- lightweight goal and metric options for form controls

### `POST /api/admin/strategy-planning`

Creates a record using a `resourceType` discriminator:

- `initiative`
- `bet`
- `competitive-watch`
- `metric-dependency`

### `PATCH /api/admin/strategy-planning/[id]`

Updates a specific record with the same resource discriminator.

## UI Design

### Strategy Hub Tab

Add a new tab to the existing strategy hub:

- `Strategy Planning`

The tab contains four sections.

### Initiatives

Show:

- title
- status
- priority
- owner
- linked goal
- linked metric
- expected impact
- review date

Allow:

- create initiative
- edit status and ownership
- open linked goal or metric

### Strategic Bets

Show:

- hypothesis
- confidence
- status
- upside
- downside
- primary metric
- owner
- review date

Allow:

- create bet
- update status and confidence
- capture decision note after review

### Competitive Watch

Show:

- competitor
- move type
- impact level
- affected metric
- observed date
- recommended response
- source link

Allow:

- create watch item
- review recent market moves quickly

### Metric Dependency Map

Show:

- parent metric
- child metric
- strength
- hypothesis
- evidence

This first version should use a compact list/table, not a full graph canvas.

## Reuse and Integration

- Use canonical metrics from the existing metric registry.
- Use goals from the existing goals table.
- Keep status/owner/review concepts aligned with actions, decisions, and reviews.
- Link outward to existing pages rather than duplicating detail views.

## Error Handling

- Form validation on all required fields.
- Ignore broken optional links instead of failing whole payloads.
- Return empty arrays if one planning subsection is unavailable but avoid taking down the whole page.

## Testing

- migration applies cleanly
- create/update APIs validate payloads correctly
- strategy hub planning tab renders with empty and populated states
- typecheck and focused lint must pass

## Rollout

1. add schema
2. add API layer
3. add `Strategy Planning` tab to the strategy hub
4. wire creation/edit flows
5. validate types, lint, and live DB state
