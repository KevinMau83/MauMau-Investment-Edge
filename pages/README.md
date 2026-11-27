# Investment Edge browser calculator

This is the GitHub Pages edition. It compares rental, flip and BRRRR scenarios using the assumptions entered during a single session. No account, private API, cookie, analytics or browser storage is used by the calculator. Email and sharing hand the report to apps the user chooses. The server-backed workspace remains in the main project for a future deployment with saved properties.

Use a static server for development, for example `python -m http.server 8080 --directory pages`. Run `node --test tests/pages.test.mjs` at the repository root. The formulas are based on the server edition's documented models. The reference test checks the overlapping results.

For GitHub Pages, serve the contents of this directory from the root of the dedicated `gh-pages` branch. All URLs are relative to the published project path. To install on iPhone, open the published page in Safari, then choose Share, Add to Home Screen, and Add.

## Area search

The default screen queries the public HUD FHA REO ArcGIS layer by Missouri city, ZIP, statewide or the initial Southwest Missouri city list. The layer describes December 2025 coverage. Its records are historical research leads and cannot confirm availability, asking price, condition or sale comparables. The area search does not calculate property returns or rank leads without those inputs.

The bundled Missouri ZIP benchmarks are derived from HUD's [FY 2027 Small Area Fair Market Rents workbook](https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_safmrs.xlsx). Each entry preserves the HUD area name and published studio through four-bedroom gross rents. Multiple area rows for a ZIP are preserved. These are program benchmarks and should not be used as property-specific rent estimates. The public HUD property service receives the area filter. The site does not store searches.
