# Backend add-on: daily deployment from When I Work

`Deployment.gs` adds a color-coded **Deployment** tab to the shared Google
Sheet, built every morning from the store's When I Work "entire schedule"
calendar link, and lets the app show each person their own shift for the day.

It is a separate file in the existing Apps Script project, plus **one line**
in `Code.gs`. Nothing else in `Code.gs` changes, so the original app keeps
working exactly as before.

## Install (one time, about 10 minutes)

1. **Open the script.** In the Google Sheet, go to **Extensions → Apps Script**.
2. **Add the file.** Click **+** next to *Files* → **Script**, name it `Deployment`,
   and paste in the whole of `backend/Deployment.gs`.
3. **Add the hook in `Code.gs`.** Find `function computeDoGetResult(sheetParam) {`
   and add this as its first line:

   ```javascript
   if (sheetParam === "deployment") return getDeploymentForApp();
   ```

   If `Code.gs` already has its own `function onOpen()`, rename the one in
   `Deployment.gs` to `deployOnOpen` and call `deployOnOpen()` from inside the
   existing `onOpen`. (The current `Code.gs` doesn't have one.)
4. **Set the time zone.** Open **Project Settings** (gear icon) and set the time
   zone to **(GMT-07:00) Pacific Time – Vancouver**.
5. **Redeploy.** Go to **Deploy → Manage deployments** → edit (pencil) → *Version:*
   **New version** → **Deploy**. Keep the same deployment, so the URL doesn't change.
6. **Authorize.** Reload the Sheet. A new **Deployment** menu appears. Choose
   **Set up deployment tabs** and approve the permission prompt. The script now
   needs to fetch the When I Work schedule (`UrlFetchApp`) and run the daily
   trigger.
7. **Set the When I Work link.** A manager's When I Work account has an
   "entire schedule" calendar link (it ends in `/global.ics`). Choose
   **Deployment → Set the When I Work link…** and paste it. It's checked and
   then stored in the script, not in the sheet. The confirmation says how many
   people it found, and warns you if any two of them share initials (see
   below). The link covers about the next 4 weeks.
8. **Build the first day.** Choose **Deployment → Build today's deployment**.
9. **Turn on the daily build.** Choose **Deployment → Turn on daily auto-build**.
   From then on the tab builds itself around 5am every day.

## Day to day

- **Leads can edit on the fly.** Type a code into any grid cell (`FL`, `PG`,
  `PROD`, `B`, …). The color follows the code automatically. Select several
  cells, type, and press **Ctrl/Cmd + Enter** to fill them all at once.
  Everything after 5am is hand-editable.
- **Moving a break works either way.** Type a new time in **BREAK** or
  **15 MIN** (`1:00`, `1p` and `1:00 PM` all work), and that person's **B**
  cells move on the grid; the role they had there fills the old slot.
  Or move the B cells on the grid, and the break times update to match.
  A time that can't be read, or that falls outside the person's shift, is
  left as typed for you to fix. This needs the edit trigger, which the
  first build after updating `Deployment.gs` installs automatically.
- **Edits are safe from the auto-build.** It never touches a day that's
  already been built. **Build today's deployment** from the menu does rebuild
  it, and asks first. A rebuild replaces the grid, keeps the Hourly Tracker
  numbers, and clears anything else added to the tab by hand.
- **Previous days are kept.** Yesterday's tab is renamed `Deployment YYYY-MM-DD`
  and kept for 14 days.
- **Breaks are placed automatically**, by shift length:

  | Shift length | Breaks |
  |---|---|
  | under 5h | none |
  | 5h to under 8h | one 15 |
  | 8h to under 8.5h | a 15 and a 30 |
  | 8.5h or more | two 15s and a 30 |

  No break falls in the first or last 30 minutes of a shift. At least two
  people stay on the floor, and at least one Floor Lead whenever one is
  scheduled. A break that can't meet those rules is still placed, but its
  cell is tinted red with a note, so a lead can check it.
- **Change the codes in one place.** The **Deployment Codes** tab holds each
  code's color and meaning, and which When I Work positions map to it (for
  example *Product Operations → PROD*). Edit it there. New codes and colors
  apply from the next build; colors on today's tab update when it's rebuilt.

## Hourly Tracker

Each build adds an **Hourly Tracker** under the staff rows. It has one column
per hour from 10am to 8pm, each sitting under that hour on the grid, plus a
**CLOSE** column under 9pm.

| Row | Hourly cell | CLOSE |
|---|---|---|
| Floor Lead | typed in | — |
| % of sales | typed in | sum |
| Sales Target | typed in | sum |
| Total | typed in | sum |
| Sales % | Total ÷ Sales Target | average |
| AOV, UPT | typed in | average |
| Transactions, Traffic | typed in | sum |
| Conversion | Transactions ÷ Traffic | average |

A formula cell stays blank until its inputs are filled in, so there are no
`#DIV/0!` errors and CLOSE averages count only the hours with data.

- **New day:** the tracker starts blank, except **% of sales**, which carries
  over from the previous day. Change which rows carry over in
  `DEPLOY.TRACKER.CARRY_OVER`.
- **Rebuilding the same day:** every number already typed in is kept.
- **Yesterday's numbers** stay on its archived `Deployment YYYY-MM-DD` tab.
- **The hours** are set by `DEPLOY.TRACKER.FIRST_HOUR` and `LAST_HOUR`.

## What the app shows

On Home, the signed-in person sees **Your shift today**: start and finish
times, a colored timeline of their roles and breaks with a marker for "now",
and each block listed with its times. It reads the Deployment tab as it
stands. The app re-checks it whenever it's reopened or brought back on
screen (if it's been more than 2 minutes), and every few minutes while it's
open, so a lead's change reaches people's phones within a few minutes.
↻ pulls it immediately.

The app matches people by **initials taken from their name on the grid**:
the first letter of the first and last names, so "Li Snyder" is LS. This
matches the initials people sign in with. Someone a lead adds to the grid by
hand is matched the same way.

If two people on the day's grid share initials (say, two "JV"s), the app
asks each of them once which name is theirs and remembers it on that phone.
A "Not you?" link undoes the choice. The build and the link setup both point
out shared initials, so nothing needs setting up for it.

## Privacy

The "entire schedule" link lets anyone who has it see **everyone's**
schedule. It's kept in the script's properties, not in the sheet, so only
script editors can see it, and the app never receives it. If it's ever
shared by mistake, the manager can reset it in When I Work and set the new
one with **Deployment → Set the When I Work link…**.
