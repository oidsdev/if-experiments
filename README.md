# if-experiments

Small interactive experiments for ignitionfoundry.com/experiments. One shipped per week by Cursor Cloud Agents.

## Experiments

- [Webhook payload builder](experiments/webhook-payload-builder/index.html). Edit a JSON body and copy a curl command. Nothing is sent.
Small interactive experiments for ignitionfoundry.com/experiments — one shipped per week by Cursor Cloud Agents.

## Experiments

- [Prompt Pack Builder](experiments/prompt-pack/): pick a job, get a starter pack (one system prompt and five task prompts). Copy one, or download the pack as markdown. Static page, runs in the browser.
## Products

- [Job Card](products/job-card/): a one-page brief you fill in before you hand a job to an AI agent. Suggested price $15. Not for sale until a payment link is added.
## $5 Flip Challenge

`flip/index.html` is the public pot tracker for ignitionfoundry.com/flip. The page fetches `flips.json` from the same directory as `pot.js`. Static files only. Serve the `flip` directory at `/flip/`.

An updater rewrites `flip/flips.json` in place. Leave `index.html` and `pot.js` alone.

The committed `flips.json` is sample data (`"sample": true`). The page says so. A live ledger omits `sample`, or sets it to `false`.

### flips.json

Money is US dollars as JSON numbers, not cents and not strings. `12.5` means $12.50. `flips` is oldest first. The page shows `current_value` as the pot and `current_value - seed` as P&L. It prints each row's `profit` as stored. Keep those numbers in agreement when you write the file: the next pot is the last sale, and `profit` is `sold_price - buy_price`.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `current_value` | number | yes | Pot after the latest flip |
| `seed` | number | yes | Starting amount |
| `sample` | boolean | no | `true` marks stand-in rows |
| `flips` | array | yes | Completed flips. `[]` is an empty pot |

Each object in `flips`:

| Field | Type | Meaning |
| --- | --- | --- |
| `item` | string | What was bought and sold |
| `buy_price` | number | What it cost |
| `sold_price` | number | What it sold for |
| `profit` | number | `sold_price - buy_price` |
| `date` | string | Sale date, `YYYY-MM-DD` |

```json
{
  "current_value": 28.5,
  "seed": 5,
  "flips": [
    {
      "item": "Brass lamp",
      "buy_price": 5,
      "sold_price": 12,
      "profit": 7,
      "date": "2026-10-02"
    }
  ]
}
```

An empty ledger, which the page renders as "No flips yet.":

```json
{
  "current_value": 5,
  "seed": 5,
  "flips": []
}
```
