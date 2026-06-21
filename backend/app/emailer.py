from __future__ import annotations

import html
import json
import smtplib
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

from app.bootstrap import resolve_seed_path
from app.config import Settings, get_settings


PORTAL_URL = "https://appraisal-frontend-staging.up.railway.app"


@dataclass(frozen=True)
class RecipientContext:
    display_name: str
    first_name: str
    email: str
    username: str
    password: str
    appraisal_role: str
    line_manager: str
    deadline: str
    kpi_areas: list[str]
    cycle_name: str


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    preview_text: str
    text_body: str
    html_body: str


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _dedupe_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
    return output


def _format_deadline(raw_value: str) -> str:
    if not raw_value:
        return ""
    return datetime.fromisoformat(raw_value).strftime("%-d %B %Y")


def _manager_display_name_for_label(seed_users: list[dict], owner_label: str) -> str:
    if not owner_label:
        return ""

    candidates = [user for user in seed_users if owner_label in (user.get("managerScopes") or [])]
    if not candidates:
        return owner_label

    def rank(user: dict) -> tuple[int, str]:
        capabilities = set(user.get("capabilities") or [])
        employee_linked = 0 if user.get("employeeId") else 1
        admin_only_penalty = 1 if capabilities == {"manager", "admin"} else 0
        return (employee_linked + admin_only_penalty, user["displayName"].lower())

    return sorted(candidates, key=rank)[0]["displayName"]


def load_seed(seed_path: Path | None = None) -> dict:
    resolved = seed_path or resolve_seed_path()
    return json.loads(resolved.read_text(encoding="utf-8"))


def build_recipient_contexts(seed: dict) -> dict[str, RecipientContext]:
    employees_by_id = {row["employeeId"]: row for row in seed["employees"]}
    assignments_by_employee: dict[str, list[dict]] = {}
    for row in seed["assignments"]:
        assignments_by_employee.setdefault(row["employeeId"], []).append(row)

    contexts: dict[str, RecipientContext] = {}
    deadline = _format_deadline(seed["cycle"].get("closesAt", ""))
    cycle_name = seed["cycle"]["name"]

    for user in seed["users"]:
        employee_id = user.get("employeeId") or ""
        if not employee_id:
            continue
        employee = employees_by_id.get(employee_id)
        if not employee:
            continue

        role_name = employee.get("appraisalRole") or employee.get("designation") or ""
        owner_label = employee.get("managerLabel") or employee.get("primaryOwnerLabel") or ""
        line_manager = _manager_display_name_for_label(seed["users"], owner_label)
        kpi_areas = _dedupe_keep_order(
            [row.get("kpiArea", "") for row in assignments_by_employee.get(employee_id, [])]
        )
        first_name, _ = _split_name(user["displayName"])

        contexts[employee_id] = RecipientContext(
            display_name=user["displayName"],
            first_name=first_name or user["displayName"],
            email=(user.get("outreachEmail") or user.get("email") or "").strip(),
            username=user["username"],
            password=user["password"],
            appraisal_role=role_name,
            line_manager=line_manager,
            deadline=deadline,
            kpi_areas=kpi_areas,
            cycle_name=cycle_name,
        )

    return contexts


def render_launch_email(context: RecipientContext) -> RenderedEmail:
    subject = "Your H1 2026 appraisal is open"
    preview_text = "Take a moment to reflect and submit your appraisal."
    text_body = f"""Hello {context.display_name},

Your BuyBetter H1 2026 appraisal is now open.

This appraisal is a chance to pause and reflect on the work you have done so far, the progress you have made, the challenges you have faced, and the support that can help you grow further. A lot of valuable work happens every day, and this process is one of the ways we make sure that effort is properly seen and documented.

The process is simple:
1. You complete your self-appraisal
2. Your line manager completes their review
3. HR/Admin finalises and releases the result

You will receive another email shortly with your login details, appraisal link, and assigned KPI areas.

When it arrives, please take your time to complete your self-appraisal thoughtfully and submit it before the deadline shown on the portal.

Thank you for the work you do and for taking this process seriously.

Warm regards,
BuyBetter HR / Appraisal Admin
"""
    html_body = f"""
<html>
  <body style="margin:0;padding:0;background:#f5f1e8;font-family:Inter,Arial,sans-serif;color:#1f2420;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #e4dccd;border-radius:18px;padding:32px;box-shadow:0 12px 32px rgba(27,42,61,0.08);">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9b927f;font-weight:700;">BuyBetter Performance Cycle</div>
        <h1 style="margin:12px 0 18px;font-size:28px;line-height:1.15;color:#1b2a3d;">Your H1 2026 appraisal is open</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">Hello {html.escape(context.display_name)},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">Your BuyBetter H1 2026 appraisal is now open.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">This appraisal is a chance to pause and reflect on the work you have done so far, the progress you have made, the challenges you have faced, and the support that can help you grow further. A lot of valuable work happens every day, and this process is one of the ways we make sure that effort is properly seen and documented.</p>
        <div style="margin:24px 0;padding:18px 20px;background:#f8f5ee;border:1px solid #e4dccd;border-radius:14px;">
          <div style="font-size:13px;font-weight:700;color:#1b2a3d;margin-bottom:10px;">The process is simple:</div>
          <ol style="margin:0;padding-left:18px;color:#4f514a;line-height:1.8;font-size:14px;">
            <li>You complete your self-appraisal</li>
            <li>Your line manager completes their review</li>
            <li>HR/Admin finalises and releases the result</li>
          </ol>
        </div>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">You will receive another email shortly with your login details, appraisal link, and assigned KPI areas.</p>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.75;">When it arrives, please take your time to complete your self-appraisal thoughtfully and submit it before the deadline shown on the portal.</p>
        <p style="margin:0;font-size:15px;line-height:1.75;">Thank you for the work you do and for taking this process seriously.</p>
        <div style="margin-top:28px;font-size:14px;line-height:1.7;color:#6f6b61;">Warm regards,<br />BuyBetter HR / Appraisal Admin</div>
      </div>
    </div>
  </body>
</html>
"""
    return RenderedEmail(subject=subject, preview_text=preview_text, text_body=text_body, html_body=html_body)


def render_login_email(context: RecipientContext) -> RenderedEmail:
    subject = "Your appraisal login details"
    preview_text = "Your login, deadline, and KPI areas are ready."
    kpi_text = "\n".join(f"- {item}" for item in context.kpi_areas) or "- KPI pack will be shared by HR/Admin"
    kpi_html = "".join(
        f"<li style=\"margin:0 0 6px;\">{html.escape(item)}</li>" for item in context.kpi_areas
    ) or "<li>KPI pack will be shared by HR/Admin</li>"
    text_body = f"""Hello {context.display_name},

Your appraisal workspace is now ready for you.

You can sign in using the details below to complete your H1 2026 self-appraisal.

Portal: {PORTAL_URL}
Username: {context.username}
Password: {context.password}

Your assigned appraisal role: {context.appraisal_role}
Your line manager: {context.line_manager}
Submission deadline: {context.deadline}

Your assigned KPI areas:
{kpi_text}

As you fill this in, please feel free to be honest and thoughtful. This is your space to reflect on your work, highlight what you have achieved, share any challenges you have experienced, and note any support that would help you do your best work.

What to do:
1. Log in using the details above
2. Review your assigned KPI areas
3. Complete your self-appraisal
4. Submit it once you are done

A few important notes:
- Your line manager will review your appraisal after you submit
- HR/Admin will release final results after the review process is complete
- Please keep your password private

If you have any trouble signing in or notice anything that looks incorrect, please reply to HR/Admin so it can be resolved quickly.

Thank you, and we hope the process feels clear and smooth for you.

Warm regards,
BuyBetter HR / Appraisal Admin
"""
    html_body = f"""
<html>
  <body style="margin:0;padding:0;background:#f5f1e8;font-family:Inter,Arial,sans-serif;color:#1f2420;">
    <div style="max-width:680px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #e4dccd;border-radius:18px;padding:32px;box-shadow:0 12px 32px rgba(27,42,61,0.08);">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9b927f;font-weight:700;">BuyBetter Performance Cycle</div>
        <h1 style="margin:12px 0 18px;font-size:28px;line-height:1.15;color:#1b2a3d;">Your appraisal workspace is ready</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">Hello {html.escape(context.display_name)},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">You can sign in using the details below to complete your H1 2026 self-appraisal.</p>

        <div style="margin:22px 0;padding:20px;background:#1b2a3d;border-radius:16px;color:#f7f5ef;">
          <div style="margin-bottom:10px;font-size:13px;opacity:.8;">Portal</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:14px;">{html.escape(PORTAL_URL)}</div>
          <div style="display:grid;grid-template-columns:1fr;gap:12px;">
            <div>
              <div style="font-size:13px;opacity:.8;">Username</div>
              <div style="font-size:16px;font-weight:700;">{html.escape(context.username)}</div>
            </div>
            <div>
              <div style="font-size:13px;opacity:.8;">Password</div>
              <div style="font-size:16px;font-weight:700;">{html.escape(context.password)}</div>
            </div>
          </div>
        </div>

        <div style="margin:22px 0;padding:18px 20px;background:#f8f5ee;border:1px solid #e4dccd;border-radius:14px;">
          <div style="font-size:13px;font-weight:700;color:#1b2a3d;margin-bottom:10px;">Your appraisal details</div>
          <div style="font-size:14px;line-height:1.9;color:#4f514a;">
            <div><strong>Assigned appraisal role:</strong> {html.escape(context.appraisal_role)}</div>
            <div><strong>Line manager:</strong> {html.escape(context.line_manager)}</div>
            <div><strong>Submission deadline:</strong> {html.escape(context.deadline)}</div>
          </div>
        </div>

        <div style="margin:22px 0;">
          <div style="font-size:13px;font-weight:700;color:#1b2a3d;margin-bottom:10px;">Your assigned KPI areas</div>
          <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#4f514a;">{kpi_html}</ul>
        </div>

        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">As you fill this in, please feel free to be honest and thoughtful. This is your space to reflect on your work, highlight what you have achieved, share any challenges you have experienced, and note any support that would help you do your best work.</p>
        <div style="margin:22px 0;padding:18px 20px;background:#f8f5ee;border:1px solid #e4dccd;border-radius:14px;">
          <div style="font-size:13px;font-weight:700;color:#1b2a3d;margin-bottom:10px;">What to do</div>
          <ol style="margin:0;padding-left:18px;color:#4f514a;line-height:1.8;font-size:14px;">
            <li>Log in using the details above</li>
            <li>Review your assigned KPI areas</li>
            <li>Complete your self-appraisal</li>
            <li>Submit it once you are done</li>
          </ol>
        </div>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.75;">If you have any trouble signing in or notice anything that looks incorrect, please reply to HR/Admin so it can be resolved quickly.</p>
        <p style="margin:0;font-size:15px;line-height:1.75;">Thank you, and we hope the process feels clear and smooth for you.</p>
        <div style="margin-top:28px;font-size:14px;line-height:1.7;color:#6f6b61;">Warm regards,<br />BuyBetter HR / Appraisal Admin</div>
      </div>
    </div>
  </body>
</html>
"""
    return RenderedEmail(subject=subject, preview_text=preview_text, text_body=text_body, html_body=html_body)


def send_email(
    *,
    to_email: str,
    rendered: RenderedEmail,
    settings: Settings | None = None,
) -> None:
    smtp_settings = settings or get_settings()
    if not smtp_settings.smtp_configured:
        raise RuntimeError("SMTP settings are incomplete")

    message = EmailMessage()
    from_name = smtp_settings.smtp_from_name.strip() or "BuyBetter"
    message["From"] = f"{from_name} <{smtp_settings.smtp_from_email}>"
    message["To"] = to_email
    message["Subject"] = rendered.subject
    message["X-Preview-Text"] = rendered.preview_text
    message.set_content(rendered.text_body)
    message.add_alternative(rendered.html_body, subtype="html")

    if smtp_settings.smtp_secure:
        with smtplib.SMTP_SSL(smtp_settings.smtp_host, smtp_settings.smtp_port) as server:
            server.login(smtp_settings.smtp_username, smtp_settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_settings.smtp_host, smtp_settings.smtp_port) as server:
        server.starttls()
        server.login(smtp_settings.smtp_username, smtp_settings.smtp_password)
        server.send_message(message)
