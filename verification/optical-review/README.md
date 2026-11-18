# Optical projection review

This page imports the actual projection components and shared styles from `src/`.
It does not start the heavyweight archive scene. The research graph is explicitly
labelled as a synthetic interaction fixture, and Cube uses a generic 3³ lattice.
No research source documents or private archive images belong in this directory.

## Run

Use the repository's installed Vite dependencies and a normal Playwright install:

```sh
npm install
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node verification/optical-review/run.mjs research
node verification/optical-review/run.mjs cube
```

`all` runs both suites. `fit` is a short follow-up check of overview fitting,
Home, continuous wheel zoom after fitting, saved view restoration, and disposal
during an animated close. It takes screenshots at desktop and 320 px width:

```sh
node verification/optical-review/run.mjs fit
```

The runner starts and stops its own local Vite server and browser. JSON results
and PNG screenshots go into the ignored `output/` directory. A failing check or
page error produces a nonzero exit status. Full suites cover 1440×960, 390×844,
and 320×740 in light and dark themes. The touch check uses native Chromium touch
events; it is not an iPhone or Safari device result.

For an interactive review, start only the fixture server:

```sh
npx vite --config verification/optical-review/vite.config.mjs
```

## Optional environment settings

| Variable                   | Purpose                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_MODULE`        | Module name or file URL of an existing Playwright install. Defaults to `playwright`.    |
| `CHROMIUM_EXECUTABLE_PATH` | Use a compatible installed Chromium executable instead of Playwright's bundled browser. |
| `CHROMIUM_ARGS`            | JSON array of arguments needed by that browser environment. Defaults to `[]`.           |
| `OPTICAL_REVIEW_OUTPUT`    | Output directory. Relative paths resolve from the command's working directory.          |
| `OPTICAL_REVIEW_PORT`      | Local Vite port. Defaults to `5184`.                                                    |

The fixture loads the product's fonts and assets from `public/`, without reading
archive content. Cube rendering and visibility readback are genuine WebGL;
there is no route interception, renderer replacement, or draw suppression.

Each report records the exact checks run and source hashes at its start. A later
`fit` report verifies only that narrower change; it does not imply that every
earlier full-suite check was rerun against the later source version. Inspect the
PNG files as well as the machine-readable results before accepting a visual
change.

## Recorded review

`reports/summary.json` separates the earlier complete component matrix from the
later research overview and modal-disposal follow-up. Both passed, but they are
different source snapshots. The full per-check state, layout measurements, and
run times remain in the three report files. Only four representative screenshots
are committed; the report metadata identifies which other images were retained
only as local review artifacts.

- `screenshots/research-desktop-light.png`: current thin-edge research layout,
  with the readable initial zoom.
- `screenshots/research-mobile-overview.png`: the explicit whole-graph overview
  at 320 px. This deliberately reduces label size; initial entry remains readable.
- `screenshots/cube-desktop-dark.png`: opaque specimen, mathematical view, and
  actual pixel estimate.
- `screenshots/cube-mobile-dark.png`: narrow-screen fit including the EYE marker
  and view frustum.
