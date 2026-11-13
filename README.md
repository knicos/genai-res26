# Atlas of AI Literacy Initiatives

A static atlas for discovering AI literacy initiatives and exploring their focus areas and connections, using the records in `results.jsonl`. Search covers initiative names, URLs, metadata, analysis summaries, inclusion decisions and reasons, classification reasons, and error messages. Filters can be combined; all search terms must match.

## Run locally

Run `npm start`, then open <http://127.0.0.1:8000>. Node.js is only needed to run tests (`npm test`); Python 3 serves the local preview. Alternatively, use any static HTTP server. Opening `index.html` directly does not support loading the JSONL file.

## Publish on GitHub Pages

1. Add the website files and `results.jsonl` to your GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select your branch and **/ (root)**, then save.

No deployment build, package installation, API keys, or backend are required. Asset and data paths are relative, so repository Pages URLs are supported.

**Review the dataset before publication:** GitHub Pages exposes the JSONL file publicly, including fields not displayed in the interface. The supplied records include local source file paths. Remove any private source metadata before publishing if needed.

## Customize the theme

Edit the color variables in the `:root` block at the top of [styles.css](./styles.css). They control page and panel backgrounds, text, accents, borders, focus outlines, and success/error states. Related elements share variables, so no other color edits are needed. For a dark theme, also change `color-scheme: light` to `color-scheme: dark` to match native form controls.

The default palette is inspired by [Generation AI](https://gen-ai.fi/en): teal accents, charcoal text, pale-blue backgrounds, and soft teal/lavender surfaces. `--brand` controls the large title; the darker `--accent` keeps small links readable. Andika is used if installed locally, with system fonts otherwise; no external font requests are made.

Cards, filter panels, notices, and the matrix panel match Generation AI's card styling: no visible border, 16px corner radius, and a `2px 2px 4px 0 #a4acbb` shadow. Adjust `--box-border`, `--box-radius`, and `--box-shadow` in [styles.css](./styles.css) to customise these shared box styles.

Action and label icons use Google's [Material Icons](https://github.com/google/material-design-icons), the icon family used by Material UI. Selected SVG paths are bundled locally in [vendor/material-icons.svg](./vendor/material-icons.svg), under [Apache-2.0](./vendor/material-icons.LICENSE.txt), without a React dependency, icon font, or external request. Icons inherit text colours and are decorative (`aria-hidden`); visible text labels remain available.

## Data and score interpretation

Each nonblank line in `results.jsonl` must be a JSON object with a `url`, plus a top-level `classifications` array or an `error`. The supplied metadata keys are `Initiative / Programme`, `Description`, and `Country / Origin`. Records may include a top-level `summary` and an `inclusion` object with `include` (`yes`, `no`, or `unknown`) and `reason`. Classifications contain `category`, `label` (`yes`, `no`, or `unknown`), `score` (0–1), and `reason`.

`roundStatus` is an object keyed by round number. Each round contains a `status`, optional provider/model information, and optionally an `error` with `type` and `message`. Unprocessed records have an empty `classifications` array and empty `roundStatus`. Legacy `analysis.classifications` and `analysis.summary` are also supported; top-level fields take precedence.

- Categories are populated from the data and grouped as **Producer**, **Audience**, **Type**, and **Topic** using the mapping in [category-groups.mjs](./category-groups.mjs). New, unmapped labels remain available under **Ungrouped** rather than being hidden.
- The four groups have consistent colours on result tags, filter headings, and both axes of the category matrix. The legend names each group; tag and matrix-label tooltips and accessible labels also identify the group. Group colours are configured with the `--producer`, `--audience`, `--type`, and `--topic` variables and their corresponding background variables in [styles.css](./styles.css). Matrix cell shading still indicates counts, not group membership.
- Select multiple **Categories** using the checkboxes. A record must have a `yes` classification for **every** selected category (AND). Leave all unchecked to show all categories.
- Without a category filter, the displayed score is the highest confidence among `yes` classifications. With selections, it is the **arithmetic mean** of the `yes` scores for the selected categories. For example, scores of 0.9 and 0.7 yield 80% confidence. A single selection uses that category's score.
- Confidence is model certainty, **not** initiative quality or an overall relevance rating. Rounded percentages are displayed; sorting uses the original numeric score.
- Results always sort by confidence **highest first**, with initiative name as the tiebreaker. Records missing a valid score for any selected category are unscored. Unscored and error records sort last.
- Results show **25 records per page**, after filtering and sorting. Use **Previous** and **Next** to navigate; the count shows the visible range and total matches. Search, category, status, and reset changes return to page 1. Pagination is hidden when there is at most one page.
- Records with an explicit `error`, any round error (even if its status is `success`), a non-success round status such as `retry`, or a nonempty classification list whose labels are **all `unknown`**, are treated as analysis errors in the filter, counts, badges, and scoring. All round error messages are displayed and searchable. Any successful classifications and summary remain visible on a partially failed record. An empty classification list is not considered an all-unknown failure. The original JSONL is not modified.
- Records without classifications, a summary, an inclusion decision, or a successful round are **Not yet analysed**, separate from errors and analysed records. Use the corresponding status filter to find them. Successful partial analyses are counted as analysed unless they contain errors; this does not imply every round has finished.
- Error records remain searchable by name, description, URL, error type, and message, including the generated explanation for all-unknown failures. Use **Errors only** with all category checkboxes unchecked to see all errors, since errors generally lack positive classifications.
- Repeated URLs are preserved as separate source records, rather than silently merged.
- Records explicitly excluded by `inclusion.include: "no"` are hidden from all other analysis statuses. Choose **Excluded only** under **Analysis status** to search just these records, including any with analysis errors. Search text and category filters still apply, and changing status resets pagination. Reset returns to **All records**, hiding exclusions again. Records with missing or `unknown` inclusion decisions remain visible under the other appropriate statuses.
- Expand **Details** to inspect labels, scores, and reasons for only the selected categories, along with any inclusion decision and its reason. With none selected, all classification evidence and the analysis summary are shown.
- Model-name tags at the top of **Details** list the distinct models recorded in `roundStatus`, including failed or retrying rounds. Repeated models appear once; records without model metadata have no model tags.
- **Details** also shows **Original row** using the JSONL record's `row` value, including for not-yet-analysed records. Records without a row value omit this reference.
- Replacing `results.jsonl` and refreshing updates the atlas. Invalid JSON or invalid record structure produces a visible loading error with a retry option.

All data stays in the browser. The page uses no remotely loaded third-party assets, tracking, or external services.

## Classification totals

The collapsed **Classification totals** panel above the matrix shows one horizontal bar per label. Counts equal the matrix's same-label totals and use the same fixed analysed dataset, excluding excluded, failed, and pending records. All four label groups are shown by default, with matching group colours. Its independent category checkboxes and grouping toggle control visibility and sorting: grouped by Producer, Audience, Type, and Topic, then count descending, or globally by count descending. Ties sort alphabetically.

Bars have visible numeric counts and accessible labels. Selecting a bar adds its category to the search filters (AND), preserves search text, and chooses **Analysed only**. Selected bars have checkmarks. The chart's **Reset** clears category selections without changing search text, status, or either visualisation's display settings. Search filters do not change bar counts or ordering.

## Category matrix

The full-width **Classification matrix** panel is collapsed by default above the initiative list; expand its heading to view the matrix and settings. Its heatmap counts records with `yes` labels in both categories; cells where the row and column labels match show single-category totals. Darker cells mean larger counts, not confidence scores. Repeated source records count separately, as in the initiative list.

The matrix always counts the full analysed dataset, independently of search text, category filters, analysis status, result pagination, and matrix cell selections. Explicitly excluded initiatives, explicit errors, round errors, all-unknown analysis failures, and not-yet-analysed records are omitted. Search filters only affect the result listing and the selected-label indicators, never matrix counts or ordering. Both axes keep categories together in **Producer**, **Audience**, **Type**, then **Topic** order, with unmapped categories last. Within each group, categories sort by unfiltered positive-record count, highest first, with alphabetical tiebreakers.

The compact **Rows** and **Columns** checkbox groups independently control which label categories appear on each axis. All row groups are enabled by default. For columns, **Audience**, **Type**, and **Topic** are enabled by default; **Producer** is initially off. Unmapped labels have an **Ungrouped** option when present. Hiding rows or columns does not remove search selections or change counts for the remaining cells. Disable all groups on either axis to hide the table and show an explanatory message. These display controls are independent of both Reset buttons.

**Group labels by category** is enabled by default. Uncheck it to sort all labels by unfiltered positive-record count, highest first, regardless of group (with alphabetical tiebreakers). Both axes follow the same ordering, with disabled column groups omitted. Changing this option preserves search filters, pagination, and category selection; group colours and matrix counts are unchanged. The option is independent of the search form's Reset button.

Selected categories have a checkmark and solid group-coloured background on both matrix axes, whether selected through the matrix or the filter checkboxes. Marker space is reserved so selection does not resize labels. The matrix **Reset** button clears category selections and highlights and returns results to page 1, preserving search text, analysis status, and grouping preference. It is disabled when no categories are selected. The search form's Reset still clears all search filters.

Cell hover and keyboard focus immediately show a floating info box with group-coloured category labels and the matching initiative count, rather than a delayed native tooltip. The box stays inside the viewport and does not intercept cell clicks. It hides when hover/focus leaves, on Escape while a cell is focused, or when scrolling, resizing, or collapsing the matrix. Cell accessible labels and the text summary below the matrix remain available.

For cells with matches, the info box also shows the top matching initiative's name and a three-line summary preview (falling back to its metadata description). Examples use the full matrix dataset, independently of search filters, and rank by the mean confidence for the cell's categories, with the same unscored handling and name tiebreaker as the results list. Zero-match cells show no example.

Hover or focus a cell for its categories and exact count. Its row, column, and both labels are highlighted with background tints using the corresponding group colours, layered over the count shading. Hovered and selected cells also use a brightness filter; keyboard focus retains a visible outline. Hover takes precedence over keyboard focus, then the selected cell; the selection highlight returns when hover and focus leave. Use arrow keys within the matrix and Enter to select. Selecting a cell adds its categories to existing selections (AND), preserves search text, chooses **Analysed only**, and returns to page 1 of matching results. Repeated selections accumulate filters without changing matrix counts or label order; selecting an already selected category leaves it selected. Cells with matching row and column labels add one category. Uncheck categories in the filters to remove them, or use Reset to clear all selections. Cells whose categories are all selected are marked as pressed; the most recently selected cell retains its row and column highlight. The matrix scrolls horizontally on narrow screens; the rest of the page remains responsive. Colors use the existing theme variables.
