# CP-0010: One failure outcome per trigger when a fallback is disabled

- **Status:** approved (spec text to apply)
- **Class:** A (fallback policy, error surface)
- **Author:** lead (from Codex review F-35) · **Date:** 2026-10-10 05:00 UTC
- **Related tasks:** T00 (`errors.py`, `config.py`), T19, T22 · **Blocks:** nothing in T00 beyond naming; T19/T22 error paths
- **Decision needed by:** before T19

## 1. Summary
`17` §1 says "When a fallback is needed but not enabled: raise `FallbackRefused`", but `09` §4 says GPU OOM raises `GpuOutOfMemory`, `02` §5 says the metric becomes `failed` / Aer unusable → `unavailable`, `05` §4.4 says Q503, and `11` §5 says Neon loss → exit non-zero. Same trigger, different prescribed outcomes.

## 2. Proposed change
### 2.1 Spec text (exact)
`17` §1 — Before:
> When a fallback is needed but not enabled: raise `FallbackRefused("FB-04 needed: …")` → exit code 3 / job failed.
After:
> When a fallback's trigger occurs and it is not enabled, the **primary path's own typed error** is raised (it is the loud path): FB-01 → GPU metrics `unavailable` ("no working GPU simulator") + Q503 for `device: gpu`; FB-02 → `LayerError` for `local`; FB-03 → `NeonError` at worker start; FB-04 → `GpuOutOfMemory` (metric `failed`); FB-05 → `NeonError`, worker exits non-zero; FB-07 → Q306. The error message names the fallback that could have been enabled. `FallbackRefused` is raised only when code **explicitly asks** to use a fallback that is not enabled (e.g. `record/spool.py` called with FB-05 off, or `sim.gpu_backend = torch` set while FB-01 is not approved) — a configuration/programming error → exit 3.

`14` §2 "Fallback discipline" row updated accordingly: "with `profile=ci`, each FB trigger raises its primary error naming the FB id; direct use of a disabled FB raises `FallbackRefused`".

### 2.2 Implementation sketch
`config.require_fallback(fb_id)` raises `FallbackRefused`; each trigger site raises its own error with `hint=f"enable {fb_id}"`.

## 3. Justification
Contradictory outcomes across `02` §5 table, `05` §4.4, `09` §4, `11` §5, `17` §1 (F-35). Tests in `14` §2 cannot satisfy all of them.

## 4. Alternatives considered
| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| Always `FallbackRefused` | Uniform | Loses the specific cause (OOM vs Neon) and statuses `unavailable`/Q503 | Less informative |
| Keep both, wrap (`FallbackRefused` with `__cause__`) | Both visible | Exit-code and status mapping still ambiguous | More complex |

## 5. Impact analysis
| Area | Impact |
|---|---|
| MVP scope and tiers | none |
| Gates and timeline | none |
| Contracts / stored data | none |
| Other specs | `17` §1, `14` §2, `03` §3.1 `errors.py` description of `FallbackRefused` |
| Modules | `config.py`, `errors.py`, trigger sites |
| Tests and golden values | Fallback-discipline tests per FB; no golden values |
| Score version | none |
| Fallback registry | wording only; no entry changes |
| Architecture | none |
| Sponsor tracks / demo | none |
| Cost | none |

## 6. Risks and rollback
None.

## 7. Decision
- Decided by: user · Date: 2026-10-10 · Outcome: approved · Notes: "I approve all suggested proposals"
- Applied to specs in: · CHANGELOG line added:
