# Character sheet integration

The existing phone-first character sheet was built in an obsolete checkout and never committed to the actual repository. Integrate that implementation into `Documents/Vara-DnD`, preserving the current compendium and rules. The app workspace is a Windows directory junction to that repository, so there is one working copy.

## Scope and choices

Keep the existing Python/YAML build and vanilla JavaScript. Build portable `site/index.html` and `site/character.html` with embedded rules, scripts and styles. Use relative navigation so both file URLs and repository-scoped GitHub Pages work. Track editable source under `web/`; keep generated `site/` and private browser saves outside Git.

Reuse the existing prototype rather than introduce a framework or a server. A framework adds installation work without helping these browser-local interactions. Accounts and automatic cross-device sync would require a separate service and are outside this integration. These are implementation decisions based on the already requested prototype, not new user requirements.

The sheet retains multiple characters, abilities and derived bonuses, HP, Arcane Health, Temporary HP, Block and Temp Block, rest dice, death saves, attacks, manoeuvres, resources, spells, gear, features, proficiencies, languages, conditions and notes. JSON backups include a format version and rules fingerprint. Invalid imports leave the current sheet intact. Browser storage failure must leave export available.

This remains a manual sheet: effects from classes, equipment, spells and rests are entered by the player. Damage changes the selected health pool. Spending Block consumes Temp Block first. Do not invent additional rules automation during integration.

## Delivery

Provide a Windows double-click launcher, clear editing and saving instructions, regression checks in the Pages workflow, and a downloadable built-site workflow artifact. Validate a clean build, character backup and resource behavior, actual browser interactions and phone-width layout. Commit the result on a feature branch; publish that branch for review if authentication is available. Do not merge or deploy changes to the shared main branch without an explicit request.
