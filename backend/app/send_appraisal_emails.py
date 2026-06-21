from __future__ import annotations

import argparse
from typing import Callable

from app.emailer import (
    RecipientContext,
    build_recipient_contexts,
    load_seed,
    render_launch_email,
    render_login_email,
    send_email,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send BuyBetter appraisal emails.")
    parser.add_argument("kind", choices=["launch", "login"], help="Which email to send.")
    parser.add_argument("--employee-id", help="Employee ID from the seed data for a single-recipient send.")
    parser.add_argument("--recipient", help="Override recipient email while keeping the selected employee context.")
    parser.add_argument("--all", action="store_true", help="Send to all seeded employee recipients.")
    parser.add_argument("--dry-run", action="store_true", help="Render and print intended recipients without sending.")
    return parser.parse_args()


def choose_renderer(kind: str) -> Callable[[RecipientContext], object]:
    if kind == "launch":
        return render_launch_email
    return render_login_email


def main() -> None:
    args = parse_args()
    if not args.all and not args.employee_id:
        raise SystemExit("Provide --employee-id for a single send, or use --all.")
    if args.all and args.employee_id:
        raise SystemExit("Use either --all or --employee-id, not both.")
    if args.all and args.recipient:
        raise SystemExit("--recipient override only works with --employee-id.")

    seed = load_seed()
    contexts = build_recipient_contexts(seed)
    renderer = choose_renderer(args.kind)

    if args.all:
        targets = sorted(contexts.items())
    else:
        context = contexts.get(args.employee_id)
        if not context:
            raise SystemExit(f"Employee context not found for {args.employee_id}.")
        targets = [(args.employee_id, context)]

    for employee_id, context in targets:
        to_email = args.recipient or context.email
        if not to_email:
            raise SystemExit(f"No recipient email available for {employee_id}.")
        rendered = renderer(context)
        if args.dry_run:
            print(f"[dry-run] {args.kind} -> {to_email} ({context.display_name}) :: {rendered.subject}")
            continue

        send_email(to_email=to_email, rendered=rendered)
        print(f"sent {args.kind} email to {to_email} for {context.display_name}")


if __name__ == "__main__":
    main()
