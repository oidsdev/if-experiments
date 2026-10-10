# Experiment checklist

Copy this folder to `experiments/<slug>/`. Use a lowercase hyphenated slug. Tick the boxes in the copy.

The validator checks file shape. This list is the bar for each stage. Stages are defined in `experiments/LIFECYCLE.md`.

```sh
cp -R experiments/_template experiments/<slug>
python3 scripts/validate_experiment.py experiments/<slug>
```

## Before building (`briefed`)

- [ ] `results.json` `id` matches the folder name
- [ ] `title` and `started` are filled in
- [ ] Hypothesis is one sentence
- [ ] What ships is something a visitor can do
- [ ] Audience names who it is for
- [ ] Primary metric has a name, a unit, and a target
- [ ] At least one guardrail has a limit
- [ ] Method says the window and what you exclude
- [ ] `status` is `briefed`
- [ ] Validator exits 0

## While building (`running`)

- [ ] `status` is `running`
- [ ] The piece matches the brief
- [ ] Any hypothesis change is written into `brief.md`

## After measuring (`measured`)

- [ ] Recorded values are in `metrics.md`
- [ ] The same values are in `results.json` `metrics` (at least one)
- [ ] `summary` says what happened, against the hypothesis
- [ ] `status` is `measured`
- [ ] Validator exits 0

## Archive

- [ ] `ended` is set and is on or after `started`
- [ ] `outcome` is `ship`, `iterate`, or `drop`
- [ ] `status` is `archived`
- [ ] Validator exits 0
- [ ] The folder stays in the repo
