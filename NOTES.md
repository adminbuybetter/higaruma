# Prototype Notes

Question being answered:

`Can BuyBetter run the 2026 appraisal cycle in one local-first web app with employee self appraisal, appraisal-owner scoring, result release, and unresolved mapping visibility before committing to a fuller system?`

Current answer:

- yes, as a prototype
- no backend was needed to validate the workflow
- the real blockers are not UI mechanics; they are unresolved KPI-role mappings and a few unresolved manager-owner mappings

Prototype verdict so far:

- employee self appraisal flow works
- appraisal-owner scoring flow works
- HR admin can release results and export state
- unresolved mappings are visible instead of being silently skipped

What should happen next if the prototype feels right:

1. finish the unresolved designation-to-KPI mappings
2. decide whether manager accounts should remain title-based or move to real named staff accounts
3. replace localStorage with a real backend
4. then fold the validated flow into a proper internal tool
