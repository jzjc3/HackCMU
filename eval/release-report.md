# IFM extraction evaluation

Run: 2026-09-12T06:13:07.787Z  
Model: IFM/K2-Horizon-375B-A23B  
Reasoning effort: low  
Max tokens: 4096  
Cases: 10

## Metrics

| Metric | Result |
|---|---:|
| Provider-completed | 8/10 |
| Fully passed | 6/10 (60.0%) |
| Event-count accuracy | 87.5% |
| Dimension accuracy | 75.0% |
| Factual-fidelity heuristic | 100.0% |
| Malformed responses | 1 |
| Provider/request failures | 2 |
| Median latency | 1436 ms |
| p95 latency | 3470 ms |

## Failures

- same-event-two-dims: dimsOk
- prompt-injection: incomplete
- correction-prior: schema_invalid
- heldout-negated-outcome: countOk, dimsOk

No local fallback is used or counted. Factual fidelity is a required/forbidden-term heuristic, not a semantic factuality guarantee. Full sanitized outputs and per-case latency are in report.json; credentials and headers are never written.
