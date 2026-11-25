## Project Maintenance Rules

While working on this project, keep the project documentation organized.

After completing a meaningful task:

1. Update `docs/TODO.md`
   - Mark completed tasks.
   - Add newly discovered tasks.
   - Keep only currently relevant items.

2. Update `docs/DECISIONS.md`
   - Record important implementation or architecture decisions.
   - Include a short reason for each decision.
   - Do not record trivial changes.

3. Update `docs/SPEC.md`
   - If implementation changes the agreed product behavior, update the specification.
   - Do not silently change the specification.

4. Remove obsolete documentation
   - Delete or rewrite information that is no longer true.
   - Avoid keeping duplicate explanations in multiple files.

5. Keep documentation concise
   - Prefer summaries over detailed work logs.
   - Do not copy chat history into documentation.
   - Preserve only information needed for future work.

6. Before starting a new task
   - Read `AGENTS.md`.
   - Read `docs/TODO.md`.
   - Read only the documentation relevant to the current task.
   - Do not scan unrelated files unless necessary.

7. When context becomes large
   - Consolidate repeated or outdated information.
   - Update the relevant project documents.
   - Continue using the documents as the source of truth instead of relying on chat history.

## Context Hygiene

Periodically review the project documentation and repository structure.

If you find:
- duplicated documentation,
- outdated TODO items,
- obsolete implementation notes,
- conflicting specifications,
- temporary files that are no longer needed,

clean them up when it is safe to do so.

Do not perform large destructive refactors only for organizational purposes.
If cleanup could change behavior, treat it as a separate task.

## End-of-Task Routine

At the end of each completed task:

1. Verify the implementation.
2. Update relevant documentation.
3. Update TODO status.
4. Record important decisions if any.
5. Remove documentation that became obsolete.
6. Leave the project in a state where a new Codex session can continue
   without needing the previous chat history.