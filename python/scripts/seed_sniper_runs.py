"""Seed Sniper runs for the latency eval — Tag 13.

Signs in to the live Supabase project with the E2E test operator
(hawramimohammed@gmail.com from server/.env), POSTs N Sniper queries
against the local Express orchestrator, and prints per-run latency.
The reports populate `fusion_reports` + `fusion_layers` so eval_latency.py
has a meaningful sample.

Usage:
    .venv/bin/python scripts/seed_sniper_runs.py        # default N=5

Env:
    SEED_N_RUNS   how many Sniper runs to issue   (default 5)
    SEED_DELAY_S  seconds between runs            (default 1)
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SERVER_BASE = os.environ.get("SERVER_BASE_URL", "http://127.0.0.1:5000")
FIXTURE = REPO_ROOT / "server" / "tests" / "fixtures" / "t1.jpg"
N_RUNS = int(os.environ.get("SEED_N_RUNS", 5))
DELAY_S = float(os.environ.get("SEED_DELAY_S", 1))


def _read_env(name: str) -> str:
    env_path = REPO_ROOT / "server" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _e2e_creds() -> tuple[str, str]:
    e2e = REPO_ROOT / "e2e" / ".env"
    email = password = ""
    if e2e.exists():
        for line in e2e.read_text().splitlines():
            if line.startswith("E2E_TEST_USER_EMAIL="):
                email = line.split("=", 1)[1].strip()
            elif line.startswith("E2E_TEST_USER_PASSWORD="):
                password = line.split("=", 1)[1].strip()
    if not (email and password):
        raise SystemExit("E2E_TEST_USER_EMAIL/PASSWORD missing in e2e/.env")
    return email, password


def _supabase_token() -> str:
    supabase_url = _read_env("SUPABASE_URL")
    if not supabase_url:
        raise SystemExit("SUPABASE_URL missing in server/.env")
    # The browser-side anon key isn't in server/.env (server uses service-role).
    # Read it from client/.env.local, which the Vite dev mounts.
    anon_key = ""
    for envfile in (REPO_ROOT / "client" / ".env.local", REPO_ROOT / "client" / ".env"):
        if envfile.exists():
            for line in envfile.read_text().splitlines():
                if line.startswith("VITE_SUPABASE_ANON_KEY="):
                    anon_key = line.split("=", 1)[1].strip()
                    break
        if anon_key:
            break
    if not anon_key:
        raise SystemExit("VITE_SUPABASE_ANON_KEY missing in client/.env(.local)")

    email, password = _e2e_creds()
    r = requests.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={
            "apikey": anon_key,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    token = r.json().get("access_token")
    if not token:
        raise SystemExit(f"Sign-in returned no access_token: {r.text}")
    return token


def main() -> int:
    if not FIXTURE.exists():
        raise SystemExit(f"fixture missing: {FIXTURE}")
    print(f"Signing in to Supabase …")
    token = _supabase_token()
    print("Token acquired.")

    image_bytes = FIXTURE.read_bytes()
    headers = {"Authorization": f"Bearer {token}"}

    for i in range(1, N_RUNS + 1):
        t0 = time.perf_counter()
        r = requests.post(
            f"{SERVER_BASE}/api/sniper/run",
            headers=headers,
            files={"image": ("t1.jpg", image_bytes, "image/jpeg")},
            timeout=60,
        )
        dur = time.perf_counter() - t0
        if r.status_code >= 400:
            print(f"Run {i}/{N_RUNS} FAILED {r.status_code}: {r.text[:200]}")
            continue
        body = r.json()
        rid = body.get("report_id", "?")
        final = body.get("final_status", "?")
        print(f"Run {i}/{N_RUNS}: report={rid[:8]}…  status={final}  wall={dur:.2f}s")
        if i < N_RUNS:
            time.sleep(DELAY_S)
    return 0


if __name__ == "__main__":
    sys.exit(main())
