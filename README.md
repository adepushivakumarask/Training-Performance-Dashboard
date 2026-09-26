# OTTER Training Dashboard V21

- Fixed Google Apps Script interview import error: ensureHeaders now returns the Sheet object.
- Daily Report Copy Table copies TSV so Excel/Google Sheets place each value in a separate cell.
- Daily ChatGPT prompt still requests the exact 5-column pipe table.
- Interviews preserve all 14 source columns: Date, Coordinator, Name, Company, Technology, Time, Round, Interview Mode, Virtual, Support, Recruiter, Response, Status, Feedback.
- Interviews support both Paste Interview Data and direct Excel/CSV import.
- Google Sheet remains the source of truth.
- Existing data is not cleared.

Deployment: replace frontend files. Because Code.gs is fixed, replace Code.gs and deploy a new Apps Script Web App version using the same /exec deployment URL if possible.


## V21 hotfix
- Preserves all V20 frontend functionality unchanged.
- Fixes Interviews import backend so saveInterviews always uses the actual Google Sheet object.
- Specifically prevents `sheet.getLastColumn is not a function`.
