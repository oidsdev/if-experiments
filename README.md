# if-experiments

Small interactive experiments for ignitionfoundry.com/experiments — one shipped per week by Cursor Cloud Agents.

An experiment is a folder under `experiments/<slug>/` with `brief.md`, `metrics.md`, and `results.json`. Copy `experiments/_template/` to start. The path from idea to archived result is `experiments/LIFECYCLE.md`.

```sh
python3 scripts/validate_experiment.py experiments/<slug>
python3 scripts/validate_experiment.py --all
```
