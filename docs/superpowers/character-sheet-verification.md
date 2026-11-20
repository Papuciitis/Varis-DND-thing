# Character sheet integration verification

2026-11-20. Base: `577b4cc` on `origin/main`; implementation branch: `codex/character-sheet`.

## Repository repair

- The app project folder was empty and not a Git repository. The real Documents/Vara-DnD checkout was clean, intact, and two commits behind GitHub.
- Fetched and fast-forwarded main without rewriting history. Connected the empty app folder to the canonical repository using a Windows directory junction. The app now reports the project as a Git repository; Git resolves both paths to the same checkout.
- Reused the existing prototype's four character assets and two-page build. No rules data or compiler changes were needed.

## Checks

- Build regression first failed because the character page, navigation and rules fingerprint were absent. It passed after integration.
- `python -m unittest discover -s tests`: 3 tests passed.
- `node --test tests/*.test.cjs`: 37 tests passed. The event harness simulates the DOM; it is separate from actual browser verification.
- Windows launcher: canonical launch, unrelated current directory, clean virtual-environment bootstrap in a path with spaces and Unicode, CMD wrapper, and useful missing-repository error verified.
- Actual Chrome: rendered desktop and 390-pixel layouts; name autosave/reload; HP decrease; tabs; catalog search; Fireball selection; JSON download; opening the standalone file; and importing the download into that file restored the name and 9 HP. Downloaded JSON also contained Fireball.
- Independent code review found no blocking issues. Its conflict-copy picker finding was fixed: a regression failed with the original selected ID, then passed after the header refresh. The full suites stayed green.
- `git diff --check` passed. Generated site output, Python environment and personal saves are excluded from tracked source.

## Decisions and limits

Keep the existing build and manual rule handling. The canonical folder is retained rather than introducing another checkout or framework. Refresh only the header after a conflict save, preserving text selection. This avoids rerendering the sheet during typing.

Phone layout was checked in Chrome's responsive mode, not on a physical phone. Cross-device sync, progression, equipment bonuses, spell costs and automatic rests remain outside this implementation; the README explains player-managed effects and portable backups. Publishing a feature branch does not deploy the GitHub Pages main site.
