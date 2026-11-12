# Atlas of AI Literacy Initiatives

A static atlas for discovering AI literacy initiatives and exploring their focus areas and connections, using the records in `results.jsonl`. Search covers initiative names, URLs, metadata, analysis summaries, classification reasons, and error messages. Filters can be combined; all search terms must match.

## Run locally

Run `npm start`, then open <http://127.0.0.1:8000>. Node.js is only needed to run tests (`npm test`); Python 3 serves the local preview. Alternatively, use any static HTTP server. Opening `index.html` directly does not support loading the JSONL file.

## Publish on GitHub Pages

1. Add the website files, the checked-in `vendor/` folder, and `results.jsonl` to your GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select your branch and **/ (root)**, then save.

No deployment build, package installation, API keys, or backend are required. Asset and data paths are relative, so repository Pages URLs are supported.

The map uses a locally bundled [umap-js](https://github.com/PAIR-code/umap-js) module. The browser never contacts a CDN. To regenerate the checked-in vendor bundle after dependency changes, run `npm ci` and `npm run build:vendor`; commit both generated files in `vendor/`. Dependencies are pinned by `package-lock.json`; third-party licenses are preserved in `vendor/umap.LICENSE.txt`. Node dependencies are development-only and are not needed to serve the site or run the tests against the checked-in bundle.

**Review the dataset before publication:** GitHub Pages exposes the JSONL file publicly, including fields not displayed in the interface. The supplied records include local source file paths. Remove any private source metadata before publishing if needed.

## Customize the theme

Edit the color variables in the `:root` block at the top of [styles.css](./styles.css). They control page and panel backgrounds, text, accents, borders, focus outlines, and success/error states. Related elements share variables, so no other color edits are needed. For a dark theme, also change `color-scheme: light` to `color-scheme: dark` to match native form controls.

The default palette is inspired by [Generation AI](https://gen-ai.fi/en): teal accents, charcoal text, pale-blue backgrounds, and soft teal/lavender surfaces. `--brand` controls the large title; the darker `--accent` keeps small links readable. Andika is used if installed locally, with system fonts otherwise; no external font requests are made.

## Data and score interpretation

Each nonblank line in `results.jsonl` must be a JSON object with a `url`, plus `analysis.classifications` or an `error`. The supplied metadata keys are `Initiative / Programme`, `Description`, and `Country / Origin`. Analysis may include a `summary`. Classifications contain `category`, `label` (`yes`, `no`, or `unknown`), `score` (0–1), and `reason`. Errors contain `type` and `message`.

- Categories are populated from the data, not hardcoded.
- Select multiple **Categories** using the checkboxes. A record must have a `yes` classification for **every** selected category (AND). Leave all unchecked to show all categories.
- Without a category filter, the displayed score is the highest confidence among `yes` classifications. With selections, it is the **arithmetic mean** of the `yes` scores for the selected categories. For example, scores of 0.9 and 0.7 yield 80% confidence. A single selection uses that category's score.
- Confidence is model certainty, **not** initiative quality or an overall relevance rating. Rounded percentages are displayed; sorting uses the original numeric score.
- Results always sort by confidence **highest first**, with initiative name as the tiebreaker. Records missing a valid score for any selected category are unscored. Unscored and error records sort last.
- Results show **25 records per page**, after filtering and sorting. Use **Previous** and **Next** to navigate; the count shows the visible range and total matches. Search, category, status, and reset changes return to page 1. Pagination is hidden when there is at most one page.
- Records with an explicit `error`, or a nonempty classification list whose labels are **all `unknown`**, are treated as analysis errors in the filter, counts, badges, and scoring. An empty classification list is not considered an all-unknown failure. The original JSONL is not modified.
- Error records remain searchable by name, description, URL, error type, and message, including the generated explanation for all-unknown failures. Use **Errors only** with all category checkboxes unchecked to see all errors, since errors generally lack positive classifications.
- Repeated URLs are preserved as separate source records, rather than silently merged.
- Expand **Details** to inspect labels, scores, and reasons for only the selected categories. With none selected, all classification evidence and the analysis summary are shown.
- Replacing `results.jsonl` and refreshing updates the atlas. Invalid JSON or invalid record structure produces a visible loading error with a retry option.

All data stays in the browser. The page uses no remotely loaded third-party assets, tracking, or external services.

## Category clusters

The expanded **Explore the atlas** panel has two keyboard-accessible tabs: **Category matrix** (default) and **Initiative map**. Only one visualisation is shown at a time; switching tabs preserves selections.

The full-width **Explore the atlas** panel is expanded by default above the initiative list. Its heatmap counts records with `yes` labels in both categories; diagonal cells show single-category totals. Darker cells mean larger counts, not confidence scores. Repeated source records count separately, as in the initiative list.

Explicit errors and all-unknown analysis failures are excluded. The overview always uses the full analysed dataset, independent of active initiative filters. Categories are ordered using deterministic average-linkage grouping on Jaccard similarity (shared positive records divided by their union), bringing related categories together without assigning hard cluster labels.

Hover or focus a cell for its categories and exact count. Use arrow keys within the matrix and Enter to select. Selecting a cell replaces category selections, clears search, chooses **Analysed only**, and returns to page 1 of matching results. Diagonal cells select one category. The matrix scrolls horizontally on narrow screens; the rest of the page remains responsive. Colors use the existing theme variables.

### Initiative similarity map

The **Similarity comparison** selector defaults to **Binary categories (ignore confidence)**. Switch to **Labels + confidence** to restore the original comparison. **Number of clusters** offers **Auto** (default) or an exact count from **1–6**. Unavailable counts are disabled when there are too few distinct profiles; switching comparison resets an unavailable count to Auto with a short notice. A manual count uses the best candidate for that count even when its silhouette is nonpositive. If it cannot form the requested nonempty groups, a visible error asks for a lower count instead of silently substituting another count. Changing comparison or cluster count resets zoom/selection; directory filters and the matrix do not change. Cluster count changes colors and labels, not map positions.

#### Binary categories

Each category is `1` for `yes`, otherwise `0` (`no`, `unknown`, and missing categories are equivalent). Scores are completely ignored, even when deciding whether duplicate-category entries conflict. Explicit and all-unknown error records remain excluded. Records with no positive categories are included if they otherwise have a usable profile; two empty positive sets have distance 0, and an empty set versus a nonempty one has distance 1.

**Jaccard distance** is one minus shared positive categories divided by their union. Shared absences do not increase similarity. **UMAP with Jaccard distance** positions the dots, emphasizing local neighborhoods of initiatives with shared positive categories.

Clusters use **k-medoids with Jaccard distance**, rather than k-means (which requires Euclidean geometry). The same 2–6 candidate counts, three deterministic farthest-first starts, silhouette selection, and one-cluster fallback apply. Binary labels describe only distinctive `yes` categories. Identical positive-category sets share a dot, regardless of confidence or negative/unknown differences.

#### Labels + confidence

The map uses every category's **label and confidence**, not just positive categories. Each category contributes three label indicators (`yes`, `no`, `unknown`) and three label-specific confidence values. Euclidean distance combines label mismatches and score differences without treating `no` and `unknown` as equivalent. Confidence is used as stored (0–1), without rounding or per-category standardisation. A missing category contributes zeros; a missing/invalid confidence has a separate indicator rather than silently becoming zero. Empty, invalid-label, or conflicting duplicate-category profiles are excluded with a visible count. Explicit and all-unknown errors are always excluded.

A seeded **UMAP projection with Euclidean distance** places confidence profiles in 2D. Both comparison modes use the same fixed random seed, 400 training epochs, up to 15 neighbors (bounded by the distinct profile count minus one), and `minDist: 0.15`. Nearest neighbors are calculated exactly using the selected mode's distance. Identical profiles are grouped before projection so they stay at one dot. One distinct profile is centered; two are placed on a line because there are too few points to fit a neighborhood graph. Coordinates are centered and displayed at a common axis scale.

This is an exploratory neighborhood map, not an accurate global-distance plot: gaps between groups and relative group sizes can be exaggerated. Clusters are still computed from the original profiles, never from UMAP positions or cluster-supervised inputs. Changing cluster count therefore does not move the dots. PCA and its explained-variance metric are no longer used. Algorithm and interpretation notes are kept here rather than displayed above the visualisations.

Identical profiles share a larger dot; source records are not deduplicated. Hover for names, or select/focus a dot to inspect its initiatives and source links. Tab enters the points, arrow keys move between them, and Enter/Space selects. Map selection does not change directory filters. Both visualisations use the full dataset, independent of filters. UMAP runs locally using the bundled library; no external services are used.

#### Zoom, pan, and automatic clusters

Use **Zoom in**, **Zoom out**, and **Reset view** (100–800%). Drag the map to pan, including on touch screens, or use Ctrl/Command + scroll to zoom around the pointer. Ordinary scrolling still scrolls the page. Focus the map itself for `+`/`-` zoom, arrow-key panning, and `0` to reset. Arrow keys on a dot still navigate initiatives, automatically bringing the focused dot into view. Dragging does not select dots. Switching tabs preserves the view; reloading the dataset resets it.

In **Labels + confidence** mode, colors represent **k-means clusters in the full profile space**, not clusters of UMAP coordinates. In Auto mode, candidates from 2 to 6 groups (bounded by distinct profiles and sample size) use three deterministic farthest-first starts. The highest mean Euclidean **silhouette score** chooses the result; ties prefer fewer clusters. Singleton silhouettes are zero. If no candidate has a positive score, one group is shown. Results are exploratory, not validated or official categories, and are recalculated when the dataset changes. A positive silhouette can still indicate weak separation.

The legend shows counts and unique numbered labels. Labels use up to two category/label pairs present in at least 50% of a cluster and at least five percentage points more often than in the full mapped dataset; otherwise they say “Mixed profiles.” The six colors are editable as `--cluster-1` through `--cluster-6` in the stylesheet. Names, selected details, and legend text identify clusters without relying on color alone.
