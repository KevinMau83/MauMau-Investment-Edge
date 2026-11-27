# Investment Edge browser calculator

This is the GitHub Pages edition. It compares rental, flip and BRRRR scenarios using the assumptions entered during a single session. No account, listing feed, server API, cookie, analytics or browser storage is used by the calculator. Email and sharing hand the report to apps the user chooses. The server-backed workspace remains in the main project for a future deployment with saved properties.

Use a static server for development, for example `python -m http.server 8080 --directory pages`. Run `node --test tests/pages.test.mjs` at the repository root. The formulas are based on the server edition's documented models. The reference test checks the overlapping results.

For GitHub Pages, serve the contents of this directory from the root of the dedicated `gh-pages` branch. All URLs are relative to the published project path. To install on iPhone, open the published page in Safari, then choose Share, Add to Home Screen, and Add.
