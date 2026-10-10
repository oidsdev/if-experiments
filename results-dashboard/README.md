# Results dashboard

Static page that reads `results.json` and renders metric cards and canvas charts. No build step and no dependencies.

## Run

From this directory:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`.

Fetching `results.json` needs HTTP. Opening `index.html` as a local file will not load it. Use **Load JSON file** on the page in that case.

Another file in this folder: `http://localhost:8080/?src=other.json`. The `src` value has to be a relative path with no `..`.

## Schema

The file is one JSON object. Unknown fields are ignored. Numbers are JSON numbers, not strings.

### Object

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| title | string | no | Page heading. Default: Results. |
| subtitle | string | no | Line under the heading. |
| updated | string | no | When the results were produced. `YYYY-MM-DD` is shown as a calendar date. |
| compare | string | no | One line explaining `delta`, such as "Change versus the prior week." |
| metrics | array | no | Cards, in order. |
| charts | array | no | Charts, in order. |

### Metric

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| label | string | yes | Card name. |
| value | number | yes | Finite number. |
| unit | string | no | Drawn after the value. `%` sits against the number. 16 characters max. |
| decimals | integer | no | Fraction digits, 0 through 6. Default: inferred, capped at 2. |
| delta | number | no | Difference from the comparison period, in the same units as `value`. Not a ratio. |
| deltaLabel | string | no | Short note after that card's delta. |

A completion card encoded as `{ "label": "Completion", "value": 37, "unit": "%", "delta": -2 }` reads as 37% and -2%.

### Chart

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| title | string | yes | Heading above the chart. |
| type | string | yes | `bar` or `line`. |
| unit | string | no | Same rules as a metric unit. `%` is also drawn on the axis. |
| decimals | integer | no | Tooltip digits. Default: inferred from the points, capped at 2. |
| points | array | yes | At least one point, drawn in array order. |

### Point

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| label | string | yes | Category or time label. |
| value | number | yes | Finite number. |

The value axis includes 0. It extends below 0 only when a point is negative.

A file that fails these checks is not drawn. The page lists each problem, for example `charts[0].type must be "bar" or "line".`

Smallest useful file:

```json
{
  "title": "Trial run",
  "metrics": [
    { "label": "Runs", "value": 12 }
  ],
  "charts": [
    {
      "title": "Runs by day",
      "type": "bar",
      "points": [
        { "label": "Mon", "value": 3 },
        { "label": "Tue", "value": 9 }
      ]
    }
  ]
}
```

## Sample

`results.json` is stand-in data for one week:

- 4,820 sessions, 37% completion, median 186 sec, 640 return visits
- Bar chart of sessions by experiment. The five bars sum to 4,820.
- Line chart of sessions by day, 5 Oct through 11 Oct 2026. Those days also sum to 4,820.

The page only reads the file in the browser. It does not send it anywhere.

## Files

- `index.html` page
- `styles.css` layout
- `app.js` load, check, and draw
- `results.json` sample
