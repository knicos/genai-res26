# AI Literacy research directory

A dependency-free static website for exploring the records in `results.jsonl`. Search covers names, URLs, metadata, analysis summaries, classification reasons, and error messages. Filters can be combined; all search terms must match.

## Run locally

Run `npm start`, then open <http://127.0.0.1:8000>. Node.js is only needed to run tests (`npm test`); Python 3 serves the local preview. Alternatively, use any static HTTP server. Opening `index.html` directly does not support loading the JSONL file.

## Publish on GitHub Pages

1. Add the website files and `results.jsonl` to your GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select your branch and **/ (root)**, then save.

No build, dependencies, API keys, or backend are required. Asset and data paths are relative, so repository Pages URLs are supported.

**Review the dataset before publication:** GitHub Pages exposes the JSONL file publicly, including fields not displayed in the interface. The supplied records include local source file paths. Remove any private source metadata before publishing if needed.

## Data and score interpretation

Each nonblank line in `results.jsonl` must be a JSON object with a `url`, plus `analysis.classifications` or an `error`. The supplied metadata keys are `Initiative / Programme`, `Description`, and `Country / Origin`. Analysis may include a `summary`. Classifications contain `category`, `label` (`yes`, `no`, or `unknown`), `score` (0–1), and `reason`. Errors contain `type` and `message`.

- Categories are populated from the data, not hardcoded.
- Select multiple **Categories** using the checkboxes. A record must have a `yes` classification for **every** selected category (AND). Leave all unchecked to show all categories.
- Without a category filter, the displayed score is the highest confidence among `yes` classifications. With selections, it is the **arithmetic mean** of the `yes` scores for the selected categories. For example, scores of 0.9 and 0.7 yield 80% confidence. A single selection uses that category's score.
- Confidence is model certainty, **not** resource quality or an overall relevance rating. Rounded percentages are displayed; sorting uses the original numeric score.
- Results always sort by confidence **highest first**, with resource name as the tiebreaker. Records missing a valid score for any selected category are unscored. Unscored and error records sort last.
- Records with an explicit `error`, or a nonempty classification list whose labels are **all `unknown`**, are treated as analysis errors in the filter, counts, badges, and scoring. An empty classification list is not considered an all-unknown failure. The original JSONL is not modified.
- Error records remain searchable by name, description, URL, error type, and message, including the generated explanation for all-unknown failures. Use **Errors only** with all category checkboxes unchecked to see all errors, since errors generally lack positive classifications.
- Repeated URLs are preserved as separate source records, rather than silently merged.
- Expand **Details** to inspect labels, scores, and reasons for only the selected categories. With none selected, all classification evidence and the analysis summary are shown.
- Replacing `results.jsonl` and refreshing updates the directory. Invalid JSON or invalid record structure produces a visible loading error with a retry option.

All data stays in the browser. The page uses no third-party assets, tracking, or external services.
