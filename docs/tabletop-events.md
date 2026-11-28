# Tabletop events and automatic effects

Available on `codex/tabletop-prototype`. Reopen the tabletop launcher after an
update so its backend matches the new page, then refresh the browser.

## Create automatic effects

Select a token, expand **Travel** below the map and choose **Automatic effects**.
The same builder is available from the token's context menu and GM Scene settings.
Choose the affected token, source rule, trigger and action. Examples:

| Rule | Trigger | Action | Duration |
| --- | --- | --- | --- |
| Regeneration 5 | Start of that token's turn | Heal 5 | Unlimited or a source application count |
| A two-turn poison | End of that token's turn | Damage `1d6`, poison | Two applications |
| Restore Block | Start of that token's turn | Add Block | Recorded maximum still applies |
| Arcane-health grant | Source's chosen event | Add arcane health | Enter its actual amount |
| A temporary condition | Source's chosen event | Apply a condition | Enter its turn duration |
| A reminder | Start of a round | Message | Unlimited |

Other triggers include movement, taking damage, gaining HP, reaching zero HP and
adding/removing a condition. Condition filters can restrict condition-change
triggers to a named effect. Amounts accept a nonnegative number or bounded dice,
such as `2d6+3`. Typed damage applies known unconditional defenses and supported
condition mechanics; use untyped/already-adjusted damage for a manual final amount.
Typed reductions precede halving; an explicit save and resistance can both halve.
Resource actions add, set or subtract Block, temp Block, temp/arcane HP or either
custom resource. HP healing caps at maximum HP. Resource grants do not count as
damage. An effect can run at most once within one chain, including across queued
saves, so reciprocal triggers cannot recurse forever.

Owners can configure effects on their own tokens; the GM can configure encounter
effects. Current HP, private sheet data and detailed health results retain the
existing sharing rules. The source/occurrence of an event is reported publicly.

## Condition duration and printed rules

In an active condition's rule disclosure, choose **Set turn duration**. The GM
also has **Duration** beside applied conditions in the condition picker. Choose a
count, start/end timing and whose turn advances it. The timer removes the whole
condition, including its current stacks. A new timer does not tick retroactively
in the phase that created it. Removing the condition clears its timer.

**Start turns** in the Campaign **Turns** tab starts the first turn. **Next turn**
runs the current turn's end effects, waits for pending decisions, then enters the
next turn. It does not roll initiative; physical and browser initiative entry
remain separate. Effects do not advance when nobody is playing, and reopening a
stored active turn does not replay its start effects.

With printed-condition automation enabled, Bleeding prompts its start-turn save
and deals end-turn stack damage; Burning, Melting and Acid exposure use supported
start-turn rules. Melting's default expiry is after its next start-turn tick.
Acid exposure loses one stack after that tick. Exposed/Tricked movement/damage
endings and supported damage endings also synchronize to the character sheet.
Ambiguous Burning sizes, unknown Melting creature types and unresolved rules
produce a GM decision event. Frostbite's minute/hour checks remain manual.

## Traps and persistent zones

Choose the map's **Spell area** tool, draw a circle, square, cone or line, then
choose **Make trigger**. Set its name, source, affected modes, height range,
entry/start-turn/end-turn timing, visibility and one-use/reusable behavior.
Configure a save, damage, condition, resource change or message using the actual
source rule. Apply/remove-condition actions show all 47 standard conditions in a
visible list with a search field. Select Custom effect for a separate name rather
than typing a standard name from memory. Centre-only or round-footprint contact
is selectable.

Players can propose areas from their character's items/spells/features or a
manual table-approved source. The area remains inactive until the GM approves
it in **Events**. Source selection does not spend inventory or spell resources;
apply those costs with the source's existing controls. The GM's Scene view lists
placed triggers for editing, removal, arming and disarming. Right-click inside
an editable area for the same edit/remove actions.

A drag previews the requested route. The server checks continuous intersections
through its whole length and stops the token at the earliest trigger. Both views
animate only to that approved stop. **Events** and the chat notification open the
pending decision. Roll a saving throw in the browser, enter the complete physical
total, or let the GM resolve/dismiss it. A successful-save half-damage option is
available. **Continue the remaining route** resumes only after all blockers are
resolved, checking later traps, intervening fog and remaining movement again.
Leave it unchecked to finish at the stop. A condition that now blocks movement
also prevents continuation. Hidden triggers remain concealed from players while
the GM can identify and resolve them. Pending routes and turn phases survive
storage reloads and campaign backups.

## Travel modes and movement

Select a token and expand **Travel**. Choose Walking, Flying, Hovering, Swimming,
Climbing or Burrowing, enter signed height/depth in feet and apply. Negative
values represent depth; walking is at zero. Public token badges show mode,
height/depth and paused status. Speed capabilities and remaining allowance follow
sheet privacy. Enter **Granted speeds** for an actual temporary spell/item/feature
grant; explicit numeric creature speeds are linked automatically. Hover requires
its own permission. A temporary bundle can expire after a number of that token's
turns. Expired unsupported flight creates a review event without invented falling
damage.

The GM can open **Game → Movement rules** for two independent campaign toggles:
**Only move on your token's initiative turn** and **Enforce movement distance
during initiative**. Own-turn-only starts off; distance enforcement starts on.
These choices persist through reopening and campaign backups. Own-turn-only
applies to player map/keyboard/compendium moves and height changes. The GM can
move tokens out of turn for reactions, forced movement and other exceptions.
Players can still edit sheets and resolve saves outside a turn.

Horizontal and vertical distance share the movement already spent. When distance
enforcement is on, initiative movement stops at the current allowance. When it is
off, movement is still counted and traps/zero-speed conditions still apply.
**Dash** adds one speed;
the GM can grant further allowance for source-specific exceptions. Exploration
counts distance without imposing a turn cap and permits **Reset movement**.
The GM's **GM reposition** control explicitly bypasses trigger/cost checks for
forced placement. It does not erase pending event decisions.

The default is the ruler's straight-line distance. GM Scene settings can choose
grid diagonals costing one square. Swimming/climbing without a dedicated speed
costs two feet per foot; an actual dedicated speed removes that extra cost.
These movement conventions use the requested
[2014 Basic Rules: Adventuring](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/adventuring#ClimbingSwimmingandCrawling)
and [Combat](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat#UsingDifferentSpeeds),
while Varis condition rules remain authoritative for their own effects.

The current map has no wall/terrain model: a direct route cannot automatically
find a corridor around artwork, determine water depth, or adjudicate climbing,
falling, creature collision or opportunity attacks. Land/emerge at zero before
switching directly between flight and burrowing. The GM can enter the required
decision, split the route, grant a speed or reposition explicitly.

## Pings, persistence and privacy

Shift-click the map or right-click **Ping map here** to share a transient point.
Pings last about six seconds and do not disclose concealed map points.

Automatic HP/resources and conditions synchronize back to a locally linked
character. Separate revisions reject stale resource/condition writes. Keep the
character linked in its owning browser for full sheet synchronization. GM
backups still omit unshared player attributes; after importing, players must
relink those private sheets. The restored public scene retains tokens, travel
states, triggers, pending decisions and initiative phase. This is independent of
player registration and adds no paid service requirement.
