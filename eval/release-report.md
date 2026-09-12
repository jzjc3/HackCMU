# IFM extraction evaluation

Run: 2026-09-12T15:18:16.615Z

Model: IFM/K2-Horizon-375B-A23B

Reasoning effort: low

Max tokens: 4096

Cases: 10

## Metrics

| Metric | Result |
|---|---:|
| Provider-completed | 10/10 |
| Fully passed | 10/10 (100.0%) |
| Event-count accuracy | 100.0% |
| Dimension accuracy | 100.0% |
| Factual-fidelity heuristic | 100.0% |
| Malformed responses | 0 |
| Provider/request failures | 0 |
| Median latency | 2436 ms |
| p95 latency | 22045 ms |

## Failures

- None

No local fallback is used or counted. Factual fidelity is a required/forbidden-term heuristic, not a semantic factuality guarantee. Full sanitized outputs and per-case latency are in report.json; credentials and headers are never written.
