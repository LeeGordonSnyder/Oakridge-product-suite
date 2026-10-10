# Backend add-on: daily deployment from When I Work

`Deployment.gs` adds a color-coded **Deployment** tab to the shared Google
Sheet, built every morning from each person's When I Work calendar feed,
and lets the app show each person their own shift for the day.

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
   needs to fetch the When I Work feeds (`UrlFetchApp`) and run the daily
   trigger.
7. **Add everyone's feed.** On the new **Staff Calendars** tab, add one row per
   person: their **initials** (same as on the app's sign-in screen), their
   **name** as it should appear on the deployment, and their **When I Work
   calendar link** (`webcal://app.wheniwork.com/calendar/….ics`). Each person
   finds their link in When I Work's calendar sync / subscribe option.
8. **Build the first day.** Choose **Deployment → Build today's deployment**.
   Check the *Status* column on Staff Calendars for anyone whose feed couldn't
   be read.
9. **Turn on the daily build.** Choose **Deployment → Turn on daily auto-build**.
   From then on the tab builds itself around 5am every day.

## Day to day

- **Leads can edit on the fly.** Type a code into any grid cell (`FL`, `PG`,
  `PROD`, `B`, …). The color follows the code automatically. Select several
  cells, type, and press **Ctrl/Cmd + Enter** to fill them all at once.
  Everything after 5am is hand-editable.
- **Edits are safe from the auto-build.** It never touches a day that's
  already been built. **Build today's deployment** from the menu does rebuild
  it, and asks first.
- **Previous days are kept.** Yesterday's tab is renamed `Deployment YYYY-MM-DD`
  and kept for 14 days.
- **Breaks are placed automatically.** The rules are the same as the WiW
  deployment workbook tool:

  | Shift length | Breaks |
  |---|---|
  | 5h or less | none |
  | over 5h and under 6h | one 15 |
  | 6h to under 8.5h | a 15 and a 30 |
  | 8.5h or more | 15 + 30 + 15 |

  No break falls in the first or last 30 minutes of a shift. At least two
  people stay on the floor, and at least one Floor Lead whenever one is
  scheduled. A break that can't meet those rules is still placed, but its
  cell is tinted red with a note, so a lead can check it.
- **Change the codes in one place.** The **Deployment Codes** tab holds each
  code's color and meaning, and which When I Work positions map to it (for
  example *Product Operations → PROD*). Edit it there. New codes and colors
  apply from the next build; colors on today's tab update when it's rebuilt.

## What the app shows

On Home, the signed-in person sees **Your shift today**: start and finish
times, a colored timeline of their roles and breaks with a marker for "now",
and each block listed with its times. It reads the Deployment tab as it
stands, so a lead's edits show up on the next refresh (↻).

The app matches people by **initials** using the Staff Calendars tab. Someone
added to the grid by hand needs a Staff Calendars row with matching initials
and name for the app to find them; the link column can stay empty.

## Privacy

A When I Work calendar link lets anyone who has it see that person's schedule.
The links live only on the Staff Calendars tab; the app never receives them.
Keep that tab to leads. If a link is ever shared by mistake, the person can
reset it in When I Work and paste the new one in.
