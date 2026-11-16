Tiny synthetic analytics-engineer-style build for the delegated-build golden harness.
4 tasks: t1 and t2 are independent (disjoint owned_paths), t3 depends on both, t4 on t3.
Acceptance commands are trivial `test -f` checks. `run.sh` copies this directory into a temp
project root; it is not real model output and not a legacy-comparison fixture.
