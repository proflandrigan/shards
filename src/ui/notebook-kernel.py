#!/usr/bin/env python3
"""
notebook-kernel.py — agent-driven Jupyter kernel helper for the Notebook
Walkthrough mode.

Subcommands:
  start    <session_id> <notebook_path>   spawn a kernel, persist its connection
                                          file under .shards/notebooks/<session>/,
                                          create the walkthrough state JSON.
  exec     <session_id> <cell_index>      execute a single cell against the live
                                          kernel; stream outputs into the
                                          walkthrough state JSON and the .ipynb
                                          file on disk.
  restart  <session_id>                   restart the kernel; mark all previously
                                          executed cells stale.
  run-all  <session_id>                   restart the kernel, then execute every
                                          code cell top-to-bottom on the fresh
                                          kernel (the "Restart & Run All"
                                          reproducibility check); stop at the
                                          first failing cell.
  stop     <session_id>                   shut the kernel down and clean up.
  status   <session_id>                   print "alive" / "dead" / "missing".

The agent calls this via Bash. The helper is the only piece that touches the
Jupyter kernel — agents never speak to jupyter_client directly. Each subcommand
is a one-shot process that connects to the persistent kernel via the saved
connection file.

State layout (per walkthrough session):

  .shards/notebooks/<session_id>/
    kernel.json              jupyter_client connection file
    kernel.pid               PID of the kernel process
    notebook.path            absolute path of the .ipynb under walkthrough
    state.json               walkthrough state (mirrored to <project>/.shards/
                             notebook-walkthrough.json by the agent for the UI)

Output: every subcommand prints a single JSON object on stdout for the agent
to parse. Errors are reported with {"ok": false, "error": "..."} — exit code
is still 0 unless the helper itself can't run (missing python deps).
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path


# ────────────────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────────────────


def project_root() -> Path:
    """Walk up from cwd until .shards/ is found, else fall back to cwd."""
    cwd = Path.cwd().resolve()
    for d in [cwd, *cwd.parents]:
        if (d / ".shards").is_dir():
            return d
    return cwd


def session_dir(session_id: str) -> Path:
    root = project_root() / ".shards" / "notebooks" / session_id
    root.mkdir(parents=True, exist_ok=True)
    return root


def conn_file(session_id: str) -> Path:
    return session_dir(session_id) / "kernel.json"


def pid_file(session_id: str) -> Path:
    return session_dir(session_id) / "kernel.pid"


def notebook_path_file(session_id: str) -> Path:
    return session_dir(session_id) / "notebook.path"


def state_file(session_id: str) -> Path:
    return session_dir(session_id) / "state.json"


# ────────────────────────────────────────────────────────────────────────────
# Output helpers
# ────────────────────────────────────────────────────────────────────────────


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(msg: str, **extra) -> None:
    payload = {"ok": False, "error": msg}
    payload.update(extra)
    emit(payload)


def now_iso() -> str:
    return _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


# ────────────────────────────────────────────────────────────────────────────
# Notebook on-disk I/O
# ────────────────────────────────────────────────────────────────────────────


def read_notebook(nb_path: Path) -> dict:
    return json.loads(nb_path.read_text(encoding="utf-8"))


def write_notebook(nb_path: Path, nb: dict) -> None:
    nb_path.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")


def cell_source(cell: dict) -> str:
    src = cell.get("source", "")
    return "".join(src) if isinstance(src, list) else str(src)


def cells_summary(nb: dict) -> list:
    cells = nb.get("cells", []) or []
    out = []
    for i, c in enumerate(cells):
        out.append(
            {
                "index": i,
                "type": c.get("cell_type", "code"),
                "executed": c.get("execution_count") is not None,
                "stale": False,
                "explained": False,
                "lastRunAt": None,
                "explanation": None,
                "outputSummary": None,
            }
        )
    return out


# ────────────────────────────────────────────────────────────────────────────
# Walkthrough state
# ────────────────────────────────────────────────────────────────────────────


def load_state(session_id: str) -> dict:
    f = state_file(session_id)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(session_id: str, state: dict) -> None:
    f = state_file(session_id)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


# ────────────────────────────────────────────────────────────────────────────
# Kernel lifecycle
# ────────────────────────────────────────────────────────────────────────────


def is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def kernel_alive(session_id: str) -> bool:
    pf = pid_file(session_id)
    if not pf.exists():
        return False
    try:
        pid = int(pf.read_text().strip())
    except Exception:
        return False
    return is_pid_alive(pid)


def spawn_kernel(session_id: str) -> int:
    """Spawn a new ipykernel process bound to a connection file under the
    session dir. Returns the kernel PID. Does not block on startup — the
    first `exec` call waits for the kernel to be ready."""
    cf = conn_file(session_id)
    if cf.exists():
        try:
            cf.unlink()
        except Exception:
            pass

    cmd = [
        sys.executable,
        "-m",
        "ipykernel_launcher",
        "-f",
        str(cf),
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        cwd=str(project_root()),
        start_new_session=True,
    )
    pid_file(session_id).write_text(str(proc.pid))

    # Wait up to ~10s for the connection file to appear.
    for _ in range(100):
        if cf.exists():
            break
        time.sleep(0.1)
    else:
        try:
            proc.terminate()
        except Exception:
            pass
        raise RuntimeError("kernel failed to write connection file within 10s")

    return proc.pid


def stop_kernel(session_id: str) -> bool:
    pf = pid_file(session_id)
    if not pf.exists():
        return False
    try:
        pid = int(pf.read_text().strip())
    except Exception:
        return False
    if is_pid_alive(pid):
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
        # Give it a moment, then SIGKILL if still alive.
        for _ in range(20):
            if not is_pid_alive(pid):
                break
            time.sleep(0.1)
        if is_pid_alive(pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
    try:
        pf.unlink()
    except Exception:
        pass
    cf = conn_file(session_id)
    if cf.exists():
        try:
            cf.unlink()
        except Exception:
            pass
    return True


def kernel_client(session_id: str):
    """Return a connected BlockingKernelClient for this session. The kernel
    must already be running."""
    from jupyter_client import BlockingKernelClient  # type: ignore

    cf = conn_file(session_id)
    if not cf.exists():
        raise RuntimeError(f"no connection file at {cf}")
    kc = BlockingKernelClient()
    kc.load_connection_file(str(cf))
    kc.start_channels()
    # Wait for kernel to be alive — first start may need a moment.
    for _ in range(100):
        try:
            kc.kernel_info(reply=True, timeout=0.5)
            break
        except Exception:
            time.sleep(0.1)
    return kc


# ────────────────────────────────────────────────────────────────────────────
# Output capture
# ────────────────────────────────────────────────────────────────────────────


def capture_outputs(kc, msg_id: str, timeout_s: float = 120.0) -> tuple[list, str, int | None]:
    """Drain iopub until the kernel reports idle for our msg_id. Returns
    (outputs_in_jupyter_format, status, execution_count)."""
    outputs: list = []
    status = "ok"
    exec_count: int | None = None
    deadline = time.time() + timeout_s

    while True:
        if time.time() > deadline:
            status = "timeout"
            break
        try:
            msg = kc.get_iopub_msg(timeout=1.0)
        except Exception:
            continue

        parent = (msg.get("parent_header") or {}).get("msg_id")
        if parent != msg_id:
            continue

        msg_type = msg.get("msg_type") or msg.get("header", {}).get("msg_type")
        content = msg.get("content") or {}

        if msg_type == "stream":
            outputs.append(
                {
                    "output_type": "stream",
                    "name": content.get("name", "stdout"),
                    "text": content.get("text", ""),
                }
            )
        elif msg_type == "execute_result":
            exec_count = content.get("execution_count", exec_count)
            outputs.append(
                {
                    "output_type": "execute_result",
                    "execution_count": content.get("execution_count"),
                    "data": content.get("data", {}),
                    "metadata": content.get("metadata", {}),
                }
            )
        elif msg_type == "display_data":
            outputs.append(
                {
                    "output_type": "display_data",
                    "data": content.get("data", {}),
                    "metadata": content.get("metadata", {}),
                }
            )
        elif msg_type == "error":
            status = "error"
            outputs.append(
                {
                    "output_type": "error",
                    "ename": content.get("ename", ""),
                    "evalue": content.get("evalue", ""),
                    "traceback": content.get("traceback", []),
                }
            )
        elif msg_type == "execute_input":
            exec_count = content.get("execution_count", exec_count)
        elif msg_type == "status":
            if content.get("execution_state") == "idle":
                break

    return outputs, status, exec_count


def short_summary(outputs: list, max_chars: int = 200) -> str:
    """Compact text summary of cell outputs for the walkthrough state."""
    parts: list[str] = []
    for o in outputs:
        t = o.get("output_type")
        if t == "stream":
            txt = o.get("text", "") or ""
            if isinstance(txt, list):
                txt = "".join(txt)
            parts.append(txt.strip())
        elif t == "execute_result" or t == "display_data":
            data = o.get("data", {}) or {}
            if "text/plain" in data:
                v = data["text/plain"]
                if isinstance(v, list):
                    v = "".join(v)
                parts.append(str(v).strip())
            elif "image/png" in data:
                parts.append("[image/png]")
            elif "image/svg+xml" in data:
                parts.append("[image/svg]")
            elif "text/html" in data:
                parts.append("[text/html]")
        elif t == "error":
            parts.append(f"{o.get('ename','Error')}: {o.get('evalue','')}".strip())
    joined = " ".join(p for p in parts if p)
    if len(joined) > max_chars:
        joined = joined[: max_chars - 1] + "…"
    return joined


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: start
# ────────────────────────────────────────────────────────────────────────────


def cmd_start(session_id: str, nb_path_str: str) -> None:
    nb_path = Path(nb_path_str).expanduser().resolve()
    if not nb_path.exists() or nb_path.suffix != ".ipynb":
        fail(f"notebook not found or not .ipynb: {nb_path}")
        return

    # Tear down any prior session under this id so start is idempotent.
    if kernel_alive(session_id):
        stop_kernel(session_id)

    try:
        pid = spawn_kernel(session_id)
    except Exception as e:
        fail(f"failed to spawn kernel: {e}")
        return

    notebook_path_file(session_id).write_text(str(nb_path))

    nb = read_notebook(nb_path)
    state = {
        "sessionId": session_id,
        "notebookPath": str(nb_path),
        "kernelPid": pid,
        "kernelStartedAt": now_iso(),
        "currentCellIndex": 0,
        "status": "ready",
        "cells": cells_summary(nb),
        "transcript": [],
    }
    save_state(session_id, state)

    emit(
        {
            "ok": True,
            "sessionId": session_id,
            "kernelPid": pid,
            "notebookPath": str(nb_path),
            "cellCount": len(nb.get("cells", []) or []),
            "stateFile": str(state_file(session_id)),
            "connectionFile": str(conn_file(session_id)),
        }
    )


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: exec
# ────────────────────────────────────────────────────────────────────────────


def cmd_exec(session_id: str, cell_index: int) -> None:
    nb_pf = notebook_path_file(session_id)
    if not nb_pf.exists():
        fail("session not started — run `start` first")
        return
    nb_path = Path(nb_pf.read_text().strip())
    if not nb_path.exists():
        fail(f"notebook missing on disk: {nb_path}")
        return

    if not kernel_alive(session_id):
        fail("kernel not alive — run `restart` or `start`")
        return

    nb = read_notebook(nb_path)
    cells = nb.get("cells", []) or []
    if cell_index < 0 or cell_index >= len(cells):
        fail(f"cell_index out of range: {cell_index} (notebook has {len(cells)} cells)")
        return

    cell = cells[cell_index]
    if cell.get("cell_type") != "code":
        # Markdown cells "execute" trivially — just mark them in state.
        state = load_state(session_id)
        state.setdefault("cells", cells_summary(nb))
        if cell_index < len(state["cells"]):
            state["cells"][cell_index]["executed"] = True
            state["cells"][cell_index]["stale"] = False
            state["cells"][cell_index]["lastRunAt"] = now_iso()
            state["cells"][cell_index]["outputSummary"] = "(markdown)"
        state["currentCellIndex"] = cell_index
        save_state(session_id, state)
        emit(
            {
                "ok": True,
                "sessionId": session_id,
                "cellIndex": cell_index,
                "cellType": "markdown",
                "status": "ok",
                "outputs": [],
                "outputSummary": "(markdown)",
                "executionCount": None,
            }
        )
        return

    code = cell_source(cell)

    try:
        kc = kernel_client(session_id)
    except Exception as e:
        fail(f"failed to connect to kernel: {e}")
        return

    try:
        msg_id = kc.execute(code, store_history=True)
        outputs, status, exec_count = capture_outputs(kc, msg_id)
    finally:
        try:
            kc.stop_channels()
        except Exception:
            pass

    # Update notebook on disk so the file pane reflects fresh outputs.
    cell["outputs"] = outputs
    if exec_count is not None:
        cell["execution_count"] = exec_count
    cells[cell_index] = cell
    nb["cells"] = cells
    write_notebook(nb_path, nb)

    # Update walkthrough state.
    summary = short_summary(outputs)
    state = load_state(session_id)
    if not state.get("cells") or len(state["cells"]) != len(cells):
        state["cells"] = cells_summary(nb)
    state["cells"][cell_index]["executed"] = True
    state["cells"][cell_index]["stale"] = False
    state["cells"][cell_index]["lastRunAt"] = now_iso()
    state["cells"][cell_index]["outputSummary"] = summary
    state["currentCellIndex"] = cell_index
    state["status"] = "ready" if status == "ok" else status
    save_state(session_id, state)

    emit(
        {
            "ok": True,
            "sessionId": session_id,
            "cellIndex": cell_index,
            "cellType": "code",
            "status": status,
            "executionCount": exec_count,
            "outputs": outputs,
            "outputSummary": summary,
        }
    )


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: restart
# ────────────────────────────────────────────────────────────────────────────


def cmd_restart(session_id: str) -> None:
    nb_pf = notebook_path_file(session_id)
    if not nb_pf.exists():
        fail("session not started — run `start` first")
        return

    stop_kernel(session_id)
    try:
        pid = spawn_kernel(session_id)
    except Exception as e:
        fail(f"failed to respawn kernel: {e}")
        return

    state = load_state(session_id)
    for c in state.get("cells", []) or []:
        if c.get("executed"):
            c["stale"] = True
    state["kernelPid"] = pid
    state["kernelStartedAt"] = now_iso()
    state["status"] = "ready"
    save_state(session_id, state)

    emit({"ok": True, "sessionId": session_id, "kernelPid": pid, "restarted": True})


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: run-all
# ────────────────────────────────────────────────────────────────────────────


def cmd_run_all(session_id: str) -> None:
    """Restart the kernel, then execute every code cell top-to-bottom against a
    single fresh kernel — the "Restart & Run All" reproducibility check. This is
    the only true test that a notebook runs clean from a cold start; incremental
    `exec` proves cells in isolation but not in order on a fresh kernel. Stops at
    the first failing cell, writes outputs back into the .ipynb, and updates
    state.json per cell as it goes."""
    nb_pf = notebook_path_file(session_id)
    if not nb_pf.exists():
        fail("session not started — run `start` first")
        return
    nb_path = Path(nb_pf.read_text().strip())
    if not nb_path.exists():
        fail(f"notebook missing on disk: {nb_path}")
        return

    # Fresh kernel — this is what makes the run a true reproducibility check.
    stop_kernel(session_id)
    try:
        pid = spawn_kernel(session_id)
    except Exception as e:
        fail(f"failed to respawn kernel: {e}")
        return

    nb = read_notebook(nb_path)
    cells = nb.get("cells", []) or []

    state = load_state(session_id)
    if not state.get("cells") or len(state["cells"]) != len(cells):
        state["cells"] = cells_summary(nb)
    state["kernelPid"] = pid
    state["kernelStartedAt"] = now_iso()
    # Nothing has run on the fresh kernel yet — clear prior execution flags.
    for c in state.get("cells", []) or []:
        c["executed"] = False
        c["stale"] = False

    per_cell: list = []
    cells_run = 0
    cells_passed = 0
    first_error = None

    try:
        kc = kernel_client(session_id)
    except Exception as e:
        fail(f"failed to connect to kernel: {e}")
        return

    # One client for the whole run (closer to a real run-all than re-handshaking
    # per cell, and cheaper). Persist partial progress in the finally block.
    try:
        for idx, cell in enumerate(cells):
            if cell.get("cell_type") != "code":
                state["cells"][idx]["executed"] = True
                state["cells"][idx]["stale"] = False
                state["cells"][idx]["lastRunAt"] = now_iso()
                state["cells"][idx]["outputSummary"] = "(markdown)"
                continue

            code = cell_source(cell)
            msg_id = kc.execute(code, store_history=True)
            outputs, status, exec_count = capture_outputs(kc, msg_id)

            cell["outputs"] = outputs
            if exec_count is not None:
                cell["execution_count"] = exec_count
            cells[idx] = cell

            summary = short_summary(outputs)
            state["cells"][idx]["executed"] = True
            state["cells"][idx]["stale"] = False
            state["cells"][idx]["lastRunAt"] = now_iso()
            state["cells"][idx]["outputSummary"] = summary
            state["currentCellIndex"] = idx

            cells_run += 1
            per_cell.append({"index": idx, "status": status})

            if status == "ok":
                cells_passed += 1
            else:
                err = next(
                    (o for o in outputs if o.get("output_type") == "error"), {}
                )
                first_error = {
                    "cellIndex": idx,
                    "ename": err.get("ename", status),
                    "evalue": err.get("evalue", "")
                    if status == "error"
                    else "execution timed out",
                }
                state["status"] = status
                break
    finally:
        try:
            kc.stop_channels()
        except Exception:
            pass
        # Persist whatever ran into the notebook + state, even on early stop.
        nb["cells"] = cells
        write_notebook(nb_path, nb)
        if first_error is None:
            state["status"] = "ready"
        save_state(session_id, state)

    cells_total = sum(1 for c in cells if c.get("cell_type") == "code")
    emit(
        {
            "ok": True,
            "sessionId": session_id,
            "restarted": True,
            "cellsTotal": cells_total,
            "cellsRun": cells_run,
            "cellsPassed": cells_passed,
            "firstError": first_error,
            "perCell": per_cell,
        }
    )


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: stop
# ────────────────────────────────────────────────────────────────────────────


def cmd_stop(session_id: str) -> None:
    stopped = stop_kernel(session_id)
    state = load_state(session_id)
    if state:
        state["status"] = "ended"
        save_state(session_id, state)
    emit({"ok": True, "sessionId": session_id, "stopped": bool(stopped)})


# ────────────────────────────────────────────────────────────────────────────
# Subcommand: status
# ────────────────────────────────────────────────────────────────────────────


def cmd_status(session_id: str) -> None:
    if not session_dir(session_id).exists() or not pid_file(session_id).exists():
        emit({"ok": True, "sessionId": session_id, "kernel": "missing"})
        return
    alive = kernel_alive(session_id)
    emit({"ok": True, "sessionId": session_id, "kernel": "alive" if alive else "dead"})


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="notebook-kernel.py", add_help=True)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sp_start = sub.add_parser("start")
    sp_start.add_argument("session_id")
    sp_start.add_argument("notebook_path")

    sp_exec = sub.add_parser("exec")
    sp_exec.add_argument("session_id")
    sp_exec.add_argument("cell_index", type=int)

    sp_restart = sub.add_parser("restart")
    sp_restart.add_argument("session_id")

    sp_runall = sub.add_parser("run-all")
    sp_runall.add_argument("session_id")

    sp_stop = sub.add_parser("stop")
    sp_stop.add_argument("session_id")

    sp_status = sub.add_parser("status")
    sp_status.add_argument("session_id")

    sp_uuid = sub.add_parser("new-session")  # convenience: print a fresh uuid

    args = parser.parse_args(argv)

    try:
        if args.cmd == "start":
            cmd_start(args.session_id, args.notebook_path)
        elif args.cmd == "exec":
            cmd_exec(args.session_id, args.cell_index)
        elif args.cmd == "restart":
            cmd_restart(args.session_id)
        elif args.cmd == "run-all":
            cmd_run_all(args.session_id)
        elif args.cmd == "stop":
            cmd_stop(args.session_id)
        elif args.cmd == "status":
            cmd_status(args.session_id)
        elif args.cmd == "new-session":
            emit({"ok": True, "sessionId": str(uuid.uuid4())})
    except SystemExit:
        raise
    except Exception as e:
        fail(f"unexpected error: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
