# Tabletop prototype

This is an experimental, separate tabletop for the Vara project. It lives on
`codex/tabletop-prototype`; nothing is merged or deployed to the main site.
The compendium remains separate. Players can optionally link saved character
sheets to their tabletop tokens.

## First version

- A DM creates a room, receives a private access key, and shares a player link.
- Players join with a nickname. No registration or external accounts.
- The DM uploads a map, creates and assigns tokens, tracks their creatures and
  reveals fog. Players edit the stats of their own characters and summons.
- Players move their assigned tokens in revealed areas. Hidden tokens and DM
  credentials are excluded from player updates by the server.
- Game changes save on the server; clients reconnect and request the latest state.
- Campaign JSON exports provide a backup independent of the hosting provider.
- Token HP and two optional resource bars appear beneath tokens and in a larger
  panel at the bottom of the map. Bars and the token statblock use the same values.
- Player stats are private by default. The player can share read-only access with
  the DM and revoke it; other players do not receive those stats.
- A high-contrast grid, feet/meters/squares ruler, right-click menus and shared
  circle, cone, line and square spell areas support encounter planning.
- The backend targets Cloudflare Workers with SQLite-backed Durable Objects on
  Workers Free. Dormant rooms load automatically when requested.

Dynamic lighting, wall tracing, automated combat rules, a fully synchronized
multi-device character library, and public hosting at scale are later work. Manual fog conceals the
map on screen; it does not prevent a player from inspecting the underlying map
image in browser tools. Hidden creature data is filtered separately on the server.

## Layout and isolation

`tabletop/web/` contains an independent browser interface, built to
`site/tabletop/`. `tabletop/shared/` owns validation, permissions and room state.
`tabletop/server/` contains the Cloudflare adapter and a local preview server
using the same room service. No link is added to the main compendium.

The existing Pages workflow only deploys `main`. The prototype workflow validates
the branch and uploads a preview artifact, with no Pages or Cloudflare deploy step.

## Validation

Verify unauthorized moves, private data filtering, persistence, invalid imports,
and disconnect/reconnect behavior. Exercise two independent browser contexts as
DM and player, including map upload, fog, ownership, refresh and a mobile viewport.
Run the existing Python and JavaScript checks to detect regressions in the site.

## Open the local prototype

Double-click `Open-Vara-Tabletop.cmd` **inside this prototype checkout**. The
launcher builds the site, starts the preview in the background, and opens
`http://127.0.0.1:8787/tabletop/`. It does not publish anything.

The launcher also locates the installed prototype under
`Documents/Vara-DnD/.task-tools/tabletop-prototype` when copied to Downloads.
For a custom checkout location, set `VARA_TABLETOP_PROJECT` to its folder.
`Open-Vara-Tabletop.cmd --locate` prints the resolved startup script without
starting a server. Startup failures keep the window open and preserve the exit code.

Use a regular browser window as the DM and a private/incognito window as a player.
Create a game, choose **Invite players**, and open the invitation in the private
window. Enter a nickname to join. Both windows must be on this computer for the
local preview; online sharing needs the Cloudflare deployment below.

The DM can remove inactive guests from **At the table** to free their guest slots.
Their token positions remain on the map. Removing/reassigning a player clears
their private stats, so another player or the DM cannot inherit that character's
attributes. The returning player can relink their saved character.

Every new guest receives a sample hero token. The DM can reassign any token in
**Controlled by**, add creatures, and toggle **Hidden from players**. The DM
edits stats for unassigned tokens; players edit their assigned characters/summons.
Use the eye brushes to reveal/conceal map cells. In **Initiative**, enter a physical
dice total in **Total**, or check **Bonus** and click **Roll d20**. Linked characters
prefill their initiative bonus; the DM does not receive an unshared player bonus.
Players change their own tokens; the DM can enter totals for any participant.
**Start turns** uses the entered totals, highest first, without rolling dice.
Unrolled tokens stay last; ties keep their existing order. Editing or rerolling
a total immediately reorders the list while keeping the current creature's turn
and round. Clear a total to mark it unrolled. Values remain until edited or cleared.
The ruler supports **Feet**, **Meters** and **Squares**. The default map scale
is 5 ft per square; the DM can change it under **Map & visibility**. Meter/feet
conversions use 1 ft = 0.3048 m, rather than treating 5 ft as exactly 1.5 m.
Phones start zoomed into the party; **Fit map** shows the whole scene.

### Token resources, statblocks and privacy

Select a token to edit its HP in the larger panel below the map. In the inspector,
expand **Token settings → Optional bars**, enable either bar, choose a resource, and set its label
and values. AC can be shown as a single number; custom values can use a maximum
or a blank maximum. The two bars can track Temp HP, Arcane Health, AC, Block,
Temp Block or custom resources. The token and statblock share these values.

The initial bar presets are:

| Token / linked sheet | Bar 2 | Bar 3 |
| --- | --- | --- |
| Playable character | Block | Temp HP |
| Monster, summon or NPC | Block | AC |

Linking fills the resource values from the sheet. Manually saving a different
bar configuration preserves that choice across relinking. Older untouched
default bars migrate to these presets; older customized bars stay intact.

Choose **Link character** or **Link monster** directly beneath the selected
token's heading in the right sidebar, then **Use this character/monster**.
Character links read this
browser's saved characters and use the existing character rule calculations for
HP, AC and abilities. Edits to resource values sync in both directions with an
open character-sheet tab on the same origin. The first two custom character
resources can use Custom resource 1/2. Derived HP maximum, AC and attributes
should be changed on the original sheet. A different browser/device needs its
own character import and link; a character snapshot in a room is not a complete
character-sheet backup.

If no characters appear, use **Create / open character sheet** in the picker.
Create or import a character on that page, then return to the map; the saved
character list refreshes automatically. Saves on another website or in a private
browser window need to be imported into this browser's tabletop copy first.

Character **Attacks** appear as visible sidebar cards with attack bonus, damage,
range/reach notes and Block DC when supplied by an equipped weapon. Equipped
weapon attacks and manually added sheet attacks update from the linked sheet.
These cards stay visible when **Abilities & actions** is minimized, and follow
the same private/shared access as the rest of the character.

Linked sheets also set token size automatically. Character size uses an explicit
sheet size when present, otherwise its ancestry. Monster size comes from its
statblock. Tiny tokens use half a square; Small and Medium use one square;
Large, Huge and Gargantuan use two, three and four squares respectively. Small
tokens draw slightly smaller than Medium within the same square. Size is public
on the map; it does not grant access to the underlying private stats.

The sidebar's **Abilities & actions** panel shows a compact resource strip,
ability scores, searchable expandable rules/actions and notes. Click its heading
to minimize it without losing the selected token or hiding the map. **Open
character sheet** opens the exact linked character on the full sheet page.
**Edit statblock** opens the larger editor. Token appearance, ownership, resource
configuration and sharing are under the separate **Token settings** disclosure.

Monster links read the compendium and browser monster edits. HP, AC, abilities
and actions populate an encounter statblock. Resource damage remains specific to
each token; it does not damage every creature using that monster template.
Changing the source template updates maxima while preserving encounter damage.

Only the token's owning player can enable **Share this character / summon with
the DM**. Shared stats are read-only for the DM. Private HP, resources, abilities,
notes and rules are stripped out of DM/other-player responses and DM campaign
exports by the server. Revoking sharing removes those fields from subsequent
updates. These are application access controls, not encryption against the
operator of the server.

Right-click a token or its bars to inspect it, adjust your HP, configure bars,
center the map or begin a measurement. DM menus also control visibility.
Right-clicking empty map space offers placement, measurement and fog actions.
Touch users can hold the map or use the token's **Actions** button.

### Spell area rulers

Press **A** or choose the spell-area tool beside the ruler. Choose **Circle**,
**Cone**, **Line** or **Square**, a size and units. Circles use radius, squares
use side length, cones use length plus angle, and lines use length plus width.
Drag on the map to set the origin and direction. The translucent preview is local
until **Place for table** saves it for everyone. These tools illustrate geometry;
they do not roll damage, choose targets or adjudicate cover.

Placed areas appear under **Spell areas** in the inspector. Players remove their
own areas; the DM can remove any area. Fog hides areas whose origins are concealed
from other players. Each scene permits 32 areas; changing the map clears them.
Right-click inside a placed area and choose **Remove spell area**. Overlapping
areas are listed separately by their shape/dimensions. Players get removal
actions for their own areas, and DMs can remove any visible area. Right-click
inside a local preview and choose **Clear spell preview** to dismiss it.

Local saves live in `.tabletop-data/`, outside Git. Keep the private DM link from
**Game → Private DM access** to recover control on another browser/device. Player
invitations never contain that key. Campaign backups contain map pixels, tokens,
DM-accessible stats and revealed areas, without authentication credentials.
Unshared player stats are omitted; keep personal character-sheet backups.
Restoring a backup clears token ownership and sharing so the DM can assign the
current players. Tokens whose stats were private restore with placeholder HP.

The launcher needs Python 3.12+ with `requirements.txt` and Node 22+. On this
machine it can reuse the existing project's Python environment and installed
preview runtime. For an ordinary clone, install the requirements and run:

```sh
python -m pip install -r requirements.txt
python build.py
cd tabletop
npm install
npm start
```

To stop a launcher-started local preview, inspect `.tabletop-data/preview.pid`
and stop that specific process. Local games are retained after the process stops.
Reopening the launcher detects backend source changes and restarts the tracked
preview process when needed. It finds the live port owner and verifies the exact
prototype script before stopping it; a stale PID file does not block recovery.
A normal browser refresh loads updated map tools.

## Separate online preview on Cloudflare Free

Only the project owner needs a Cloudflare account. DMs and players use room links
and guest identities. This is independent of the live GitHub Pages deployment.
`tabletop/wrangler.jsonc` defines the separate `vara-tabletop-prototype` Worker,
the SQLite-backed room storage, and static assets from the built `site/` directory.
It has no production domain routes, paid storage bindings, or R2 requirement.

After building from the prototype branch, the owner can run:

```sh
cd tabletop
npm install
npx wrangler login
npm run check:cloudflare
npm run deploy:prototype
```

Choose the Workers **Free** plan. Then open the resulting Worker's address with
`/tabletop/` appended. The page discovers its own API automatically, so no API key
or account token belongs in `web/config.js`. Assets use the static-asset service;
game state uses SQLite-backed Durable Objects. Changing source and redeploying the
same Worker preserves those room stores. Dormant rooms read their saved state on
the next request; no owner-operated resume action is part of this application.

If the interface is later hosted separately, set the public HTTPS backend address
in `tabletop/web/config.js` and add the interface's exact origin to
`ALLOWED_ORIGINS`. Guest invitations also carry the public server address. Private
keys travel in an Authorization header or the initial WebSocket authentication
message, and private recovery links keep the key in the URL fragment.

Free-tier quotas still apply. The prototype caps new games at 40/day for the whole
installation, 12 guest players/game, 32 socket connections/game, 128 tokens/scene,
and 10,000 fog cells. Uploaded maps are compressed in the browser to at most 2,048
pixels on their longest side, with a maximum encoded payload of 1.5 MB. Replacing
maps removes the old asset. There is no periodic keep-alive job.

Cloudflare references: [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[static-asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/),
and [asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

## Checks and current limits

Build the site, then run the existing Python and JavaScript suites and:

```sh
node --test tests/tabletop-*.test.mjs
node tabletop/qa/browser-qa.cjs
```

Browser QA uses two separate browser contexts and the actual room service through
in-process HTTP/WebSocket routes. It checks guest joining, ownership, fog filtering,
private stats, read-only sharing/revocation, optional bars, character resource
updates in both directions, monster links, right-click menus, ruler units, all
four shared spell shapes, dice, map upload, backups, restore, refresh, reconnect
and mobile width.
It records screenshots and an explicit result for native browser downloads under
`.qa/`. On Windows application sandboxes, loopback sockets and browser download
writes can be blocked; those limitations are recorded rather than reported as
passing network/download tests. The CI workflow additionally installs Wrangler
and checks a Cloudflare dry-run bundle without deploying it.

Cloudflare account login, a real deployment, and a remote multi-device session
remain necessary before treating this as ready for a scheduled game. This first
version has one scene per room, manual fog, and no wall-based lighting. Guest
access is tied to the browser; the DM can reassign tokens if a player changes
devices. The sample watchtower is an original SVG demonstration map, not rules
data or a map imported from a commercial source.
