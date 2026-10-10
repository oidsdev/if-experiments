# Experiment lifecycle

An experiment is a folder, `experiments/<slug>/`. It moves one way: idea, briefed, running, measured, archived. The stage is `status` in `results.json`.

`_template` is the starter. Every other folder is an experiment. Copy it, then follow `experiments/_template/CHECKLIST.md`.

```sh
cp -R experiments/_template experiments/<slug>
python3 scripts/validate_experiment.py experiments/<slug>
```

The slug is lowercase words separated by hyphens, matching `results.json` `id`. Example: `night-sky`.

## idea

The folder exists and the validator passes. The hypothesis in `brief.md` is one sentence. `status` is `idea`.

## briefed

`brief.md` says what ships and who it is for. `metrics.md` names the primary metric, at least one guardrail, and how you will count. `status` is `briefed`.

Build after the validator passes.

## running

The piece runs and does what the brief says. If the hypothesis changes, edit `brief.md` and note what changed. `status` is `running`.

## measured

`metrics.md` has the recorded numbers. `results.json` repeats them in `metrics` and says what happened in `summary`, against the hypothesis. `status` is `measured`. At least one metric is required.

## archived

Set `ended` to the day you stop (`YYYY-MM-DD`, on or after `started`). Set `outcome` to `ship`, `iterate`, or `drop`. Set `status` to `archived`.

- `ship`: it can go on ignitionfoundry.com/experiments.
- `iterate`: another pass is a new folder. This folder is the record of the last pass.
- `drop`: stop. The folder stays.

Archived folders stay in the repo.

## Files

| File | Role |
| --- | --- |
| `brief.md` | Hypothesis, what ships, audience |
| `metrics.md` | Primary metric, guardrails, method, recorded numbers |
| `results.json` | Record checked against `experiments/results.schema.json` |

The validator reads those three files. It also requires these headings: Hypothesis, What ships, and Audience in `brief.md`; Primary, Guardrails, and Method in `metrics.md`. `CHECKLIST.md` is the human list for each stage.
