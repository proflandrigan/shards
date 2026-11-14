# Python Review Checklist

Apply this systematically when reviewing any Python file.

The shared engineering guidelines at `.claude/agents/specific_instructions/shared/engineering_guidelines.md` define the implicit standard against which the code is measured. Flag departures (overcomplication, speculative scope, drifting refactors, unverified work) under the appropriate section below or as their own finding.

## Structure
- Imports organized: stdlib → third-party → local, no wildcard imports
- Single responsibility: does the module do one thing?
- Dead code: unused imports, commented-out blocks, unreachable branches
- Consistent error handling strategy

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
