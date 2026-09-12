# IFM extraction evaluation

Run: 2026-09-12T05:56:50.095Z  
Model: IFM/K2-Horizon-375B-A23B  
Reasoning effort: low  
Max tokens: 4096  
Cases: 35

## Metrics

| Metric | Result |
|---|---:|
| Provider-completed | 26/35 |
| Fully passed | 20/35 (57.1%) |
| Event-count accuracy | 84.6% |
| Dimension accuracy | 76.9% |
| Factual-fidelity heuristic | 100.0% |
| Malformed responses | 1 |
| Provider/request failures | 9 |
| Median latency | 3586 ms |
| p95 latency | 14348 ms |

## Failures

- single-health: timeout
- same-event-two-dims: dimsOk
- one-connected-event: timeout
- emotion-tired: timeout
- noisy-transcript: malformed_json
- travel-real: timeout
- reading: timeout
- learning: dimsOk
- max-six: timeout
- ambiguous-pronoun: countOk, dimsOk, clarificationOk
- relationship-dinner: countOk, dimsOk
- failed-attempt-real: timeout
- heldout-negated-outcome: countOk, dimsOk
- heldout-inactive-only-match: timeout
- heldout-ambiguous-no-event: countOk, dimsOk, clarificationOk

No local fallback is used or counted. Factual fidelity is a required/forbidden-term heuristic, not a semantic factuality guarantee. Full sanitized outputs and per-case latency are in report.json; credentials and headers are never written.
