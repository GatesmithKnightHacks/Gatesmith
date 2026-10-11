# ChP-0053: Bound Gemini generation to ten comments

- Status: approved by integration coordinator; Class B; Date: 2026-10-11
- Related: spec19 §§4.1,5,9; ChP0049 §G; operating rule R5.

## Proposed implementation

Keep the public `ReviewDraft` contract and all local validation unchanged. Its maximum remains 100 comments. Create the primary generation schema from that contract and reduce only `properties.comments.maxItems` to 10 for each provider request. Keep every other property, required field, enum, length, minimum, extra-field restriction and reference unchanged. No error path substitutes another schema or model.

This is an internal per-review generation budget within the existing public contract, not a weaker acceptance rule. The server's output-token budget remains 8192, thinking stays HIGH, and at most one review call is attempted per current head (bounded transient retries as specified). General-comment and changed-line/evidence/version/numeric checks remain unchanged.

## Evidence

After the user completed Gemini prepay, a synthetic high-thinking call without output constraints succeeded, while the unchanged strict contract request returned HTTP400 INVALID_ARGUMENT. Controlled coordinator-only schema experiments isolated generation complexity: the full original schema with only maxItems reduced from 100 to 10 succeeded. No schema normalization, dynamic-map change, missing fields, alternative model or removed local constraint was necessary. Successful bounded call: 224 input tokens, 466 billed output tokens including 446 thinking tokens, estimated $0.006040. Root private evidence: ~/.config/qscore/smoke/gemini-schema-ablation.json; credentials never enter the repository or delegated runs.

Google documents that large or complex schemas may be rejected: https://ai.google.dev/gemini-api/docs/generate-content/structured-output . Installed google-genai2.29 serializes response_json_schema correctly; the previously chosen public SDK field remains primary.

## Impact and verification

No changes to public schemas/contracts, acceptance, scoring, verification, golden values, model/provider, external data flow, dependencies, architecture or MVP scope. Reviews generate at most ten candidate comments before the existing filters. Tests must prove that only this request-schema bound differs, the public contract remains unchanged, and all strict local rejection checks remain active. Independent review and a real PR review remain required.

## Alternatives

Removing schema constraints or using unconstrained text was used only to diagnose the provider rejection; neither enters the product. Changing the model or repairing output is rejected. Retrying a failed head with a different schema is rejected; a new synthetic demo head will test the corrected implementation.
