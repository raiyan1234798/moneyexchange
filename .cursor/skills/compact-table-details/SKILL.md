---
name: compact-table-details
description: Hides dense multi-line table cell content behind a click-to-reveal Dialog. Use when Branch Directory hours, schedules, or other dashboard columns dump long wrapped text into every row and should stay compact until the user clicks.
---

# Compact table details

## When to use

Branch Directory **Hours** (and similar columns) must not render full weekly schedules in every row. Keep the cell compact; show the full schedule only after a click.

## Pattern

1. **Cell (default):** outline `Button` size `sm` with a clear label (`View hours`) and optional icon (`Clock`).
2. **Empty:** if no hours are set, show muted `Not set` — do not open an empty dialog.
3. **Click:** open `Dialog` with structured rows (e.g. Monday–Sunday), not the raw `Mon … · Tue …` dump.
4. **Closed days:** render as muted/italic `Closed`.
5. **Accessibility:** `title` + `aria-label` explaining that click shows the full schedule.

## Reference implementation

`web/src/app/dashboard/branches/page.tsx`:

- `hoursDetailRows(branch)` — builds day rows from `workingHoursByDay` or legacy `workingHours`
- `ViewHoursButton` — compact cell control + dialog

## Do not

- Put `branch.workingHours` (or similar long summaries) directly in the table cell
- Hide the control with `hideOnMobile` unless mobile has another way to open the same details
- Add a new UI library for this — use existing `Button` + `Dialog`
