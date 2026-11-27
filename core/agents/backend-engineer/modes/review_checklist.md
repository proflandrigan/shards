# Python Review Checklist

Apply this systematically when reviewing any Python file.

The shared engineering guidelines at [`protocols/engineering_guidelines.md`](../../../protocols/engineering_guidelines.md) define the implicit standard against which the code is measured. Flag departures (overcomplication, speculative scope, drifting refactors, unverified work) under the appropriate section below or as their own finding.

## Correctness and Security
- Logic does what the names, docstrings and callers expect: off-by-one, wrong
  conditions, mutable default arguments, shared state between requests
- Exceptions: no bare `except:` or broad `except Exception: pass` that swallows
  errors; failures are logged with the traceback and surfaced, not hidden
- Contracts honoured: return types and raised errors match what callers and
  type hints promise
- No secrets, tokens or credentials hardcoded or logged
- No SQL or shell commands built by string formatting from input
  (parameterized queries, no `shell=True` with user data)
- Untrusted input validated before use (paths, IDs, payload sizes)

## Structure
- Imports organized: stdlib → third-party → local, no wildcard imports
- Single responsibility: does the module do one thing?
- Dead code: unused imports, commented-out blocks, unreachable branches
- Consistent error handling strategy

## Simplicity, Duplication and Cruft
- **Cruft:** flag unused functions, classes, variables, imports, parameters, config keys, or dead feature flags/branches; commented-out code blocks; stale compatibility shims, migration leftovers, or scaffolding; defensive fallbacks or error handling for unreachable or impossible states.
- **Duplication:** flag copy-pasted logic blocks; near-identical functions, routes, Pydantic validators, or helpers differing only by a parameter or type that should share one helper or mapping; duplicated constants, mappings, or schemas; bespoke utilities reimplementing stdlib, framework, or existing project helpers.
- **Overly complex code:** flag deep nesting ("arrow code") that should use early returns or small helpers; convoluted conditionals or boolean logic; bloated functions doing too much; clever one-liners or dense nested comprehensions that obscure intent; premature abstractions (factories, registries, strategy/ABC hierarchies) built for 1–2 call sites; speculative flexibility or configurability (kwargs, flags, or defaults nobody overrides).
- **Unnecessary wrappers and indirection:** flag single-use wrapper functions or classes that add no validation, error boundary, or contract; trivial pass-through methods or delegates; thin wrappers around stdlib, third-party, or ORM calls that merely rename arguments; single-method classes that should be plain functions; pointless intermediate adapter/DTO layers between modules that already share a contract.
- **Reporting standard:** cite concrete `file:line`, name the specific simplification (inline, delete, consolidate, flatten), and explain the concrete risk (copy drift, hidden control flow, cognitive load, maintenance drag); acknowledge clean, simple code rather than inventing issues.

## FastAPI
- Thin route handlers: business logic lives in services/dependencies, not routes
- `Depends()` used for all shared dependencies (DB sessions, auth, config)
- Explicit response models on all routes (`response_model=...`)
- Router organization: grouped by resource, not by HTTP method
- Lifespan events used for startup/shutdown (not deprecated `on_event`)
- Middleware placement: auth/logging at app level, not inside routes

## Pydantic
- All fields typed — no `Any` without justification
- Validators placed at the right boundary (data entry, not service layer)
- `@field_validator` used correctly (v2 API, not v1 `@validator`)
- `model_config` set appropriately (strict mode, extra fields policy)
- `Field()` used for constraints (min_length, gt, pattern)
- No bare dicts passed where Pydantic models should be used

## OOP
- Class responsibilities clearly bounded: one class, one concern
- Prefer plain functions over single-method classes (unless implementing a stateful protocol or interface)
- Avoid unnecessary abstraction or inheritance layers (factories, registries, ABCs) when a simple function or composition suffices
- Inheritance used only when IS-A, not HAS-A
- Dataclass vs. Pydantic vs. plain class decision is intentional
- No god classes (>200 lines usually a warning sign)
- `__init__` not doing heavy computation or I/O

## Modularization
- Business logic separated from I/O (DB calls, HTTP calls, file reads)
- Configuration via environment variables, not hardcoded values
- Module boundaries clear: no cross-module circular imports
- Service layer distinct from data access layer

## Performance
- No blocking I/O (requests, time.sleep, open()) inside `async def` functions
- N+1 patterns: loops that trigger repeated DB/API calls
- Generator vs. list: large sequences should be generators where possible
- Unnecessary data copies: list comprehensions copying large datasets
- Memory patterns: loading entire files/datasets when streaming suffices

## Data Contract
- All data at system boundaries validated with Pydantic models
- ORM models and Pydantic schemas aligned (or explicitly mapped)
- Nullable fields documented and handled consistently
- Schema versioning considered if this is an external API
- No raw dict returns from public-facing functions that should have typed models
