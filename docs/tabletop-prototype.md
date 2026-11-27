# Tabletop prototype

This is an experimental, separate tabletop for the Vara project. It lives on
`codex/tabletop-prototype`; nothing is merged or deployed to the main site.
The compendium and character sheet remain independent.

## First version

- A DM creates a room, receives a private access key, and shares a player link.
- Players join with a nickname. No registration or external accounts.
- The DM uploads a map, creates and assigns tokens, changes HP and reveals fog.
- Players move their assigned tokens in revealed areas. Hidden tokens and DM
  credentials are excluded from player updates by the server.
- Game changes save on the server; clients reconnect and request the latest state.
- Campaign JSON exports provide a backup independent of the hosting provider.
- The backend targets Cloudflare Workers with SQLite-backed Durable Objects on
  Workers Free. Dormant rooms load automatically when requested.

Dynamic lighting, wall tracing, automated combat rules, full character-sheet
integration, and public hosting at scale are later work. Manual fog conceals the
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

Use a regular browser window as the DM and a private/incognito window as a player.
Create a game, choose **Invite players**, and open the invitation in the private
window. Enter a nickname to join. Both windows must be on this computer for the
local preview; online sharing needs the Cloudflare deployment below.

The DM can remove inactive guests from **At the table** to free their guest slots.
Their tokens and HP remain on the map, ready to assign to a returning player.

Every new guest receives a sample hero token. The DM can reassign any token in
**Controlled by**, add creatures, edit HP, and toggle **Hidden from players**.
Use the eye brushes to reveal/conceal map cells. **Start turns** follows token-list
order; this is a manual turn tracker, not automated initiative calculation.
The ruler measures squares without assuming a unit conversion for the Vara rules.
Phones start zoomed into the party; **Fit map** shows the whole scene.

Local saves live in `.tabletop-data/`, outside Git. Keep the private DM link from
**Game → Private DM access** to recover control on another browser/device. Player
invitations never contain that key. Campaign backups contain map pixels, tokens,
HP and revealed areas, without authentication credentials. Restoring a backup
clears token ownership so the DM can assign the current players.

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
shared dice, map upload, backups, restore, refresh, reconnect, and mobile width.
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
