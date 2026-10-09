# Changelog

All notable changes to `@ranza/data-export` will be documented in this file.

## 0.0.0

- Initial release: Data export on demand and scheduled export automation with RLS and worker processing.
- An export can now produce a file. The worker reads each dataset through a function that answers for the export's requester as they are when it runs, `ranza_worker` holds no table privilege, a failure reaches `failed` with a reason code, and a file expires after seven days.
- The module splits into the Staff Member's half (`createDataExportModule`) and the worker's (`createExportRunner`). The list never carries a file, a download is audited and asks the downloader again, and CSV cells that would run as formulas are written as text.
- `excel` is no longer a format; nothing wrote one.
