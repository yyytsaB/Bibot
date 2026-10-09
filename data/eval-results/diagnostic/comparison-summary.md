# F5 Model Comparison Summary

**Evaluation Date**: 2026-10-09
**Scope**: 15 Approved F3 Test Cases (T01–T15) across 2 Installed Candidates

## 1. Candidate Model Hardware & Packaging Metadata

| Candidate Model | Tag/Digest | Size | Parameter Size | Quantization |
|---|---|---|---|---|
| **qwen2.5:7b** | `845dbda0ea48` | 4.36 GB | 7.6B | Q4_K_M |
| **llama3.2:latest** | `a80c4f17acd5` | 1.88 GB | 3.2B | Q4_K_M |

## 2. Quantitative Evaluation Targets & Results

All criteria are evaluated against the locked standards in `docs/DECISIONS.md`:

| Metric / Target | Target Threshold | **qwen2.5:7b** | **llama3.2:latest** |
|---|---|---|---|
| **First-Attempt Schema Validity** | ≥ 95.0% (15/15) | 93.3% (14/15) ❌ | 100.0% (15/15) ✅ |
| **Vague Case Clarification Rate** | 100.0% (7/7) | 0.0% (0/7) ❌ | 0.0% (0/7) ❌ |
| **Invented Misconceptions (Vague)** | Exactly 0 | 7 ❌ | 7 ❌ |
| **Typical Pipeline Latency (Median)** | < 10.0s (10,000ms) | 27.90s (27899.5ms) ❌ | 9.04s (9038.9ms) ✅ |
| **Retries Count** | Minimal | 1 | 5 |
| **Repairs Count** | Minimal | 0 | 0 |
| **Human Agreement Status** | ≥ 80.0% Unanimous (≥7/8) | **PENDING** ⏳ | **PENDING** ⏳ |

## 3. Latency Distribution Breakdown

| Candidate Model | Pre-flight Warm-up | Median (P50) | Mean | P90 | Min | Max |
|---|---|---|---|---|---|---|
| **qwen2.5:7b** | 19.58s | 27.90s | 29.45s | 30.67s | 22.27s | 57.18s |
| **llama3.2:latest** | N/A | 9.04s | 10.99s | 17.19s | 7.03s | 17.34s |

## 4. Human Review Status

- **Required Reviewers**: Two distinct human judges.
- **Judged Cases**: 8 clear misunderstanding diagnosis cases (T01, T02, T03, T04, T05, T06, T12, T13).
- **Current State**: Judgments remain unfilled (`null`) and human agreement is strictly **PENDING**.
- Unfilled review sheets have been generated for both models:
  - [`qwen2.5-7b-judge-sheet.md`](./qwen2.5-7b-judge-sheet.md)
  - [`llama3.2-latest-judge-sheet.md`](./llama3.2-latest-judge-sheet.md)

## 5. Model Recommendation & Provisional Status

### Provisional Recommendation: **None / Blocked**

Neither model passed all quantitative targets. See breakdown above for failures.

## 6. Completed vs Pending Work

### Completed Work
- [x] Verified F3 source evaluation cases and unfilled measurement template.
- [x] Confirmed installed local Ollama models (`qwen2.5:7b` and `llama3.2:latest`).
- [x] Built observable evaluation transport, runner, and summary statistics.
- [x] Verified offline runner with deterministic test suites (100% passing).
- [x] Executed live F4 Express pipeline smoke test with live `qwen2.5:7b`.
- [x] Executed live sequential 15-case evaluation for both installed models.
- [x] Saved filled evaluation result copies to `data/eval-results/` without modifying source files.
- [x] Formatted human judge review sheets with empty slots.

### Pending Work
- [ ] Independent human review by Judge 1 across 8 clear cases.
- [ ] Independent human review by Judge 2 across 8 clear cases.
- [ ] Computation of final human agreement score (≥80% required for sign-off).
- [ ] Final confirmation of model selection and F5 completion sign-off.
