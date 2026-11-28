# Tabletop events implementation record

Requested and implemented 28 November 2026. All changes are isolated to
codex/tabletop-prototype. The list below records the implemented scope; remaining
source-dependent decisions are in ai_data_design_points_of_interest.md.

- Import committed main through 51c9f2d, preserving newer feat/spell selection and
  tabletop condition calculations. Root checkout contains unrelated uncommitted tests.
- Shared authoritative movement checks the straight route, intermediate fog,
  trigger geometry, altitude and movement mode. Pause at the earliest trigger;
  persist the interrupted route and resume only after resolution, rechecking later
  traps and remaining movement. Animate clients only to server-authorized stops.
- Walk, fly, hover, swim, climb and burrow are travel modes, separate from the 47
  canonical conditions. Height/depth and mode are public; capabilities and private
  character attributes retain existing sharing rules. Vertical motion costs movement.
- Use known source speeds plus explicit temporary grants. No free-flight inference
  from unselected options or incidental mentions in a spell description.
- Per-turn movement budget, Dash/extra allowance, manual exploration reset and
  GM forced reposition. Swimming/climbing without their own speed costs an extra
  foot per foot, as the user requested from 2014 5e. No automatic Athletics success.
- Shapes: circle, line, square and cone traps/zones; configured height range,
  affected modes, ownership, visibility, one-shot/reusable and source. Player-owned
  placements can be proposed from their items/spells; GM approval arms them.
- Chat records automatic effects and event notifications. A left-side Events view
  handles unresolved traps, saves and proposals, respecting hidden traps and private HP.
- Trigger builder: start/end turn, start round, movement, damage, healing, HP zero,
  condition changes; explicit damage/heal/resource/condition/message actions and
  bounded chaining. User-configured regeneration and finite turn durations.
- Automate unambiguous printed turn rules; saves create prompts. Do not invent
  Fatigue 6/7 penalties, timed real-world checks, resource costs or ambiguous rules.
- Synchronize server-changed resources and conditions back to linked local sheets
  without stale sheet refreshes restoring old HP or statuses.
- Add one useful complementary feature if practical: shared map pings.
- Update patch notes, design notes, points of interest and prototype documentation;
  test geometry, permissions, interruption/resume, automation idempotency, sheet
  synchronization, fresh-store/backup persistence and the GM/player browser flow.

Rule references read: data/conditions.yaml; data/draft-reference/conditions.yaml;
data/draft-reference/combat.yaml; explicit regeneration source examples; 2014 Basic
Rules adventuring and combat on dndbeyond.com. Default distance should retain the
existing ruler's straight-line convention, with an explicit grid-diagonal option.

## Verification

- Full JavaScript suite: 486 passed, including 95 tabletop checks. Tests cover
  continuous intersections, fog, shared travel budgets, private health, stacked
  conditions, duration, finite regeneration, bounded chains, overlapping traps,
  source switching, fresh storage, paused backups and turn-phase idempotency.
- Full Python suite after the main merge: 170 passed. The six build contracts
  passed again after connecting the shared monster-editor helper. Build output
  contains 302 monsters and all 47 original conditions.
- Independent GM/player browser contexts passed the full desktop/mobile flow,
  including an open character sheet receiving automatic HP/condition changes,
  trigger building, interrupted/resumed movement, hidden-trap privacy, player
  proposals, flight/depth badges, pings, map upload, reconnect and campaign restore.
  Eighteen screenshots were captured; there were no page errors. Windows native
  browser downloads were canceled by the sandbox; the download event and exact
  exported backup payload were verified through the existing fallback.
- GitHub main was verified at 51c9f2d and merged as f6845db. Root checkout edits
  belonging to other tasks were left untouched. Main was not deployed or merged
  with the prototype; the local tabletop launcher must be reopened after updating.
