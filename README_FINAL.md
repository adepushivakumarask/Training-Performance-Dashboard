# OTTER Training Dashboard – Updated Package

## Included updates
- Interview import preserves duplicate rows instead of deduplicating them.
- Interview import processes rows in manageable batches and reports imported row count.
- CSV/XLSX upload and paste-based interview import remain available.
- Interview parser supports common US short dates such as `9/10/26` and maps all 14 source fields.
- Interview module includes Overall Results, search/company/status filters, S.No, row count, latest-date-first sorting, and inline Status/Feedback dropdowns.
- Dashboard separates today's Recent Interviews from future Upcoming Interviews.
- Interview table has bounded height with internal scrolling.
- Candidate module hides the global month selector.
- Google Sheet refresh runs every 10 minutes while the page is visible; sidebar shows connection state and failure guidance.
- Audit timestamp columns use `yyyy-mm-dd hh:mm:ss` display formatting; interview status/feedback edits update `UPDATED_AT`.
- S.No/counts added to key training/candidate/interview tables.

## Install
1. Back up the currently working dashboard folder and Google Sheet.
2. Replace frontend `index.html`, `app.js`, and `style.css` with the included files.
3. Open Apps Script attached to the same Google Sheet and replace `Code.gs` with the included version.
4. Save and deploy a **new version** of the Apps Script web app. Keep the same deployment URL if you are updating the existing deployment; if a new deployment URL is created, update `API_URL` in `app.js`.
5. Reload the website and test with the sample CSV before importing the full month's data.

## Verification notes
- `app.js` syntax check passed.
- `Code.gs` JavaScript syntax check passed (using a `.js` copy for Node's parser).
- The provided sample CSV contains 83 data rows and 14 columns; the dashboard parser test parsed all 83 rows with 0 skipped.
- ZIP integrity and browser/Google Apps Script runtime behavior still need to be verified after deployment against the user's actual Google Sheet.

## Latest interview dashboard adjustments
- Recent Interviews and Upcoming Interviews now render a compact 9-column table: Date, Executive, Candidate, Client, Technology, Time, Type of Interview, Platform, and Mode.
- Recent is limited to today's interview date; Upcoming lists future dates. Dates are shown in the table.
- Interview Status dropdown includes “Waiting for Update”. Records with that status appear in Notifications as follow-up reminders until their status is changed.
- Existing `Code.gs` updateInterview endpoint already supports Status/Feedback updates and UPDATED_AT timestamps. This frontend-only adjustment does not require replacing `Code.gs`; keep your currently working deployed script.
