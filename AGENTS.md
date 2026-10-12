# Project: SpendSense (India)

## What it is
SpendSense is an offline-first personal expense tracker mobile app for
Android and iOS. All data stays on the user's phone. No backend and no
login for now.

## Stack (do not change without asking me)
- React Native + Expo (TypeScript), Expo Router
- Local DB: expo-sqlite with Drizzle ORM
- State: Zustand
- Charts: react-native-gifted-charts
- PDF/CSV: expo-print, expo-sharing, expo-file-system
- App lock: expo-local-authentication
- Reminders: expo-notifications

## Platforms
Android and iOS must both work. Avoid Android-only APIs in core features.
Add iOS permission descriptions (Face ID, notifications) in app config.
SMS auto-detect is Android-only and optional, so keep it isolated.

## Navigation (5 bottom tabs)
Home, Transactions, Add, Stats, Planner (Tasks + Notes sub-tabs).
Settings = gear icon on Home. Budgets live inside Stats.
Reports = Export PDF/CSV buttons inside Stats and Transactions.

## India and money rules
- Currency INR. Format with Intl.NumberFormat('en-IN') (₹1,00,000 lakh style).
- Users may enter and see decimal amounts (max 2 decimal places, e.g. 50.75).
- Store as INTEGER PAISE internally. Convert at input and display only.
  Never use floats for stored money or totals.
- Default accounts: Cash, UPI, Bank, Card.
- Offer both calendar year and financial year (April-March).

## Architecture
Screens -> Zustand stores -> services (logic) -> repositories (DB) -> SQLite
- No SQL inside screen files. All DB code lives in /src/db/repositories.
- Keep the repository layer clean so a backend can be added later.

## Working rules
- Work on ONE stage at a time. Before coding, show a short plan and wait for my approval.
- After each stage: tell me how to run and test it, and what I should see.
- Keep code simple, small functions, short comments. Explain decisions
  briefly in plain language, I am learning.
- Do not install new libraries without telling me why.
- Never hardcode secrets.
- Update the "Current status" section below at the end of every stage.
## Current status
Stage 1 complete:
- Initialized Expo TypeScript project with Expo Router.
- Implemented 5 bottom tabs: Home, Transactions, Add, Stats, Planner (with Tasks and Notes sub-tabs).
- Created Settings modal accessible via the gear icon on Home.
- Built comprehensive Light and Dark theme system with live theme switcher (`useAppTheme`, system/light/dark options).
- Created INR paise money utility (`rupeesToPaise`, `paiseToRupees`, `formatPaiseToINR`).
- Established clean folder architecture: `src/constants`, `src/db/repositories`, `src/store`, `src/services`, `src/utils`, `src/context`.
- Passed strict TypeScript compilation with zero errors.

Stage 2 complete:
- Installed `expo-sqlite` and `drizzle-orm` for 100% offline local SQLite storage.
- Designed Drizzle schemas in `src/db/schema.ts` for categories, accounts, transactions, and expense limits (budgets).
- Enforced strict integer paise money storage (no floats).
- Initialized and seeded default Indian categories (Food, Travel, Rent, Bills, Shopping, Health, Entertainment, Education, Other + Income categories) and default accounts (Cash, UPI, Bank, Card).
- Implemented clean repository functions: `transactionRepository`, `categoryRepository`, `accountRepository`, `limitRepository` (with overall and category-specific monthly expense limits).
- Added interactive monthly limit selector on Home screen (e.g., ₹2,000, ₹5,000, etc.) that persists to SQLite.
- Verified TypeScript compilation with zero errors.

Stage 3 complete:
- Implemented full interactive Add and Edit Transaction screen in `app/(tabs)/add.tsx`.
- Built toggle between Expense and Income ("someone paid me").
- Implemented decimal amount input with automatic real-time conversion and storage as integer paise (e.g. 50.75 -> 5075 paise).
- Built category selector dynamically pulling from local SQLite categories.
- Built payment account picker (Cash, UPI, Bank, Card).
- Added date entry and optional note/description with input validation.
- Wired edit (`transactionRepository.update`) and delete (`transactionRepository.delete`) workflows.
- Verified TypeScript compilation with zero errors.

Stage 4 complete:
- Implemented full interactive Transactions history screen in `app/(tabs)/transactions.tsx`.
- Organized records into date-grouped cards ("Today", "Yesterday", and calendar dates) with automatic timestamp display.
- Built real-time search input filtering transactions by notes, categories, and accounts.
- Added multi-filter chips for Type (All, Expense, Income) and Payment Accounts (All, UPI, Cash, Bank, Card).
- Created live top totals header displaying filtered +Income, -Expenses, and Net Balance.
- Streamlined categories: consolidated family income sources under "Pocket Money".
- Added context-aware placeholder examples (expenses vs. income notes).
- Added two-choice prompt ("Apply from Today" vs. "Apply from Next Week") when changing monthly limits.
- Tapping any transaction opens Edit/Delete mode seamlessly.
- Verified TypeScript compilation with zero errors.

Stage 5 complete:
- Installed `zustand` for high-performance reactive client state management.
- Created central store in `src/store/useAppStore.ts` coordinating SQLite transactions, categories, accounts, and monthly expense limits.
- Updated Home screen (`app/(tabs)/index.tsx`) to pull live reactive metrics: Total Balance, This Month's Income, and This Month's Expenses.
- Added This Month's spending vs. Monthly Limit progress bar with real-time budget overage warning.
- Added one-tap Quick-Add buttons ("+ Expense", "+ Income") directly on Home screen.
- Connected the Last 5 Transactions list so new records and edits reflect instantly.
- Passed strict TypeScript compilation with zero errors.

Stage 6 complete (UI Polish & Features):
- Home screen: "SpendSense" centered in header (placeholder view balances settings icon). "Offline Personal Finance" subtitle removed.
- Home screen: Low-income warning banner — when total expenses exceed total income, a prominent red alert appears inside the balance card.
- Settings screen: "Clear All Data & Start Fresh" destructive button implemented using `resetAllData()` from Zustand store.
- Add/Edit screen: Date mode toggle — "Auto (Now)" captures full timestamp; "Pick Date" lets user type YYYY-MM-DD while recording time is still auto-saved. Validation on manual date format. Back button shown when editing.
- Transactions screen: Tapping a transaction now opens a bottom-sheet detail modal showing category icon, amount, account, full date, recorded time, and type. Edit and Close action buttons inside the modal.
- Passed strict TypeScript compilation with zero errors.

Stage 7 complete (Expense Balance Validation):
- Add/Edit screen: Enforced balance check — users cannot add an expense if available balance is zero or less.
- Add/Edit screen: Enforced overage check — users cannot record an expense amount exceeding their available balance.
- Add/Edit screen UI: Added a live "Balance: ₹..." badge in the Amount card showing current funds available.
- Add/Edit screen UI: Added dynamic real-time warning indicators when funds are ₹0 or when the entered amount exceeds available balance.
- Add/Edit screen: Connected `useAppStore.refreshAll()` upon saving/updating/deleting so all screens immediately synchronize.
- Passed strict TypeScript compilation with zero errors.

Stage 8 complete (Quick Fixes, Calendar Picker & Charts Analytics):
- Home screen: Fixed Quick-Add button alignment — `+ Income` is placed directly under the Income box and `+ Expense` directly under the Expense box. Tapping either pre-selects the corresponding type in the Add screen.
- Transactions screen: Detail modal now clearly distinguishes editable "Transaction Date" from the immutable audit "Recorded On" timestamp (`createdAt`).
- Add/Edit screen: Added interactive Visual Calendar Modal with month navigation (`<` / `>`), days grid, and 1-tap "Today" and "Yesterday" shortcuts.
- Installed `react-native-gifted-charts` and `react-native-svg`.
- Stats screen: Built interactive Category Donut Chart (`PieChart`) with inner label showing total amount and color-coded category slices.
- Stats screen: Built Daily Spending Trend Bar Chart (`BarChart`) for the last 7 days.
- Stats screen: Added period filter selector ("This Month", Indian "Financial Year" April-March, and "All Time") with dynamic metrics calculation and net savings summary.
- Passed strict TypeScript compilation with zero errors.

Stage 9 complete (Reliability, Planner, Exports & Settings):
- Fixed the Stats source syntax break and verified strict TypeScript compilation with zero errors.
- Moved database setup to one synchronous startup path before tabs render, and made transaction create/update avoid SQLite `RETURNING` queries that were failing on Android.
- Simplified Planner Notes to plain notes with no visible category/type selector; updated Tasks and Notes copy for study goals, ideas, and reminders.
- PDF export now creates a real PDF file and opens the device Save/Share sheet; CSV export continues to create and share a CSV file from both Stats and Transactions.
- Made Settings functional: saved theme selection, biometric app lock, daily 8 PM reminder, offline JSON backup/restore, and complete data reset for transactions/tasks/notes/budget.
- Added iOS notification usage text in app config.

Stage 10 complete (Runtime Error Fixes):
- Prevented Android Fast Refresh from reusing a closed SQLite native connection by opening a dedicated SQLite connection.
- Added an Add Transaction guard that removes a stale edit transaction route parameter when the record no longer exists.
- Deferred loading `expo-notifications` until reminders are enabled, so Settings remains usable when the optional native module is unavailable.
- Fixed Android PDF sharing by copying the generated Print PDF from its protected temporary URI into the app document directory before sharing.
- Verified strict TypeScript compilation and a fresh Android Expo bundle.

Stage 11 complete (Stats & Settings UX):
- Matched the Stats header, spacing, and export button layout to Transactions.
- Added optional saved name and a personalized welcome message that appears only when a name is saved.
- Removed the old "100% offline-first" security claim from Settings.
- Biometric App Lock now checks device support and confirms authentication before enabling.
- Improved daily reminder replacement and cancellation handling, and registered the Expo notifications config plugin.
- Verified strict TypeScript compilation, Expo configuration, and a fresh Android bundle.

Stage 12 complete (Notification Runtime Compatibility):
- Normalized the dynamically imported Expo Notifications module to support default-export interop.
- Added explicit runtime checks and a clear native rebuild message when notification APIs or Android channels are unavailable.
- Allowed notification module errors to reach Settings so the reminder switch reports the actual problem instead of a permission-denied fallback.
- Verified strict TypeScript compilation and an Android bundle.

Stage 13 complete (Expo Go Notification Import):
- Replaced the dynamic Expo Notifications import with the documented namespace import to avoid missing notification API exports in Expo Go.
- Kept notification handler setup lazy until notification features are used.
- Verified strict TypeScript compilation and an Android bundle.

Stage 14 complete (Period Budgets & Interactive UI):
- Added separately saved weekly, monthly, and India financial-year budgets; weeks run Monday–Sunday and financial years run April–March.
- Connected Home summaries and budget progress to the selected budget period, and added matching budget controls plus week/month/FY/all-time filters in Stats.
- Replaced transaction, task, note, and full-reset confirmation alerts with themed confirmation dialogs.
- Added a validated rupee limit editor, a personalized Home welcome for a saved name, and refreshed light-theme colors/card styling.
- Reset now removes all saved budgets before restoring the default monthly limit.
- Verified weekly/monthly/financial-year date boundaries, strict TypeScript compilation, and an Android bundle.

Stage 15 complete (Task Due Reminders):
- Added local due-date notifications for tasks and saved notification IDs with each task.
- Cancelled task reminders when a task is completed, deleted, or removed during a full data reset; reopened tasks with future due dates are scheduled again.
- Kept task creation available when notifications are denied or unavailable and surfaced when a reminder could not be scheduled.
- Verified strict TypeScript compilation and an Android bundle.

Stage 16 complete (Task Reminder Timing):
- Date-only task deadlines now schedule a reminder at 12:00 AM local time on the due date.
- Added an optional 24-hour due-time field; timed tasks let users choose one reminder 1 hour, 30 minutes, or 10 minutes beforehand (30 minutes by default).
- Persisted due times and reminder offsets in SQLite, including automatic migration for existing databases and rescheduling of previously saved task reminders.
- Updated Planner task cards and reminder guidance to display the selected due time and reminder timing.
- Verified strict TypeScript compilation, targeted diagnostics, and an Android bundle.

Stage 17 complete (Notification Startup Crash):
- Removed the eager runtime import of `expo-notifications`; the notification module now loads only when a notification feature is used.
- Kept API availability checks and a clear compatibility error so notification failures do not prevent the app and navigation from starting.
- Verified strict TypeScript compilation, targeted diagnostics, and an Android bundle export.

Stage 18 complete (No-Spend Challenge & Transaction Date Guard):
- Added a Home no-spend challenge card with a catchy prompt, selectable 1-, 2-, or 3-day goals, saved challenge state, and streak progress derived from local expense history.
- Challenge streaks reset when an expense is recorded for the current day; progress updates when Home refreshes and survives app restarts.
- Enforced valid transaction dates of today or earlier in manual entry, calendar selection, and the transaction repository for create/update operations.
- Disabled future days and navigation to future months in the transaction date picker; improved local date formatting and rejected invalid calendar dates.
- Clearing app data also clears the saved no-spend challenge.
- Verified streak/date boundary cases, strict TypeScript compilation, targeted diagnostics, and an Android bundle export.

Stage 19 complete (Challenge Confirmation & Loss Feedback):
- Added a confirmation prompt before accepting or restarting a no-spend challenge, including the selected goal and loss rule.
- Recorded the challenge start time so spending from earlier on the same date does not count as a loss.
- Home now clearly labels a lost challenge and offers a “Try again” action; expenses after acceptance determine the lost state from saved transactions.
- Verified challenge loss boundary cases, strict TypeScript compilation, targeted diagnostics, and an Android bundle export.

Stage 20 complete (No-Spend Challenge Dialog Polish):
- Replaced the platform-default challenge alert with a branded, themed confirmation dialog that matches the app’s light/dark palettes.
- Added clearer challenge goal emphasis, explicit loss-rule guidance, and distinct accept/restart versus decline actions.
- Verified TypeScript diagnostics and Android bundle export.

Stage 21 complete (App-Wide UI/UX Consistency):
- Standardized screen spacing, headers, cards, and content rhythm across Home, Transactions, Add, Stats, Planner, and Settings.
- Improved touch targets and visual states for filters, period selectors, export actions, Planner tabs, form controls, and primary actions.
- Refined task/note empty states and modal surfaces with clearer hierarchy and consistent themed treatment.
- Preserved existing app behavior and both light/dark themes.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 22 complete (Settings UI Refinement):
- Added a clear Settings intro and refined profile, theme, security/reminder, backup, and reset sections with stronger visual hierarchy and more consistent cards and controls.
- Separated destructive data reset from routine settings and made the warning clearer without changing reset behavior.
- Preserved existing settings behavior and light/dark theme support.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 23 complete (Notes & Settings Visual Touch-Ups):
- Refined Planner note cards with category icons and accents, improved title/content hierarchy, clearer date and amount details, and accessible edit/delete actions.
- Highlighted the saved profile name with the existing theme-aware green brand accent and centered the Settings modal title.
- Kept SpendSense's existing green brand color and preserved light/dark theme behavior.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 24 complete (Payment Account Picker & Profile Copy):
- Hid the Bank account from the Add/Edit transaction payment-account picker while leaving saved Bank accounts and historical transactions intact.
- Removed the redundant profile helper sentence while keeping name editing and the personalized Home welcome feature.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 25 complete (Transaction Report Date Ranges):
- Hid Bank from the Transactions account-filter chips without changing saved accounts or transaction history.
- Added CSV/PDF report-period selection for Sunday–Saturday current week, selectable month/year, and custom date ranges.
- Added month/year navigation and custom calendar selection with future dates disabled and end dates constrained to on/after the selected start date.
- Exports honor the selected period and existing search/type/account filters; current partial month/year ranges stop at today.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 26 complete (Stats Period Filtering):
- Fixed Stats' week range to start Sunday, matching the Transactions report week and including income recorded on Sunday.
- Added selectable month, calendar year, and custom date range filters to Stats while retaining Financial Year and All Time.
- Applied selected dates consistently to income/expense totals, income-source/category and account breakdowns, and report exports; future dates are disabled.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 27 complete (Stats Trend & PDF Report Polish):
- Updated the Stats spending trend chart to follow the selected period, using daily, monthly, or yearly buckets as appropriate and horizontally scrollable charts for longer ranges.
- Aligned Stats date comparisons with local calendar dates so date-only choices match the dates displayed in Transactions.
- Removed the "100% Offline" PDF tagline; PDF reports now show generation date/time plus each transaction's date/time and recorded timestamp.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 28 complete (Stats Graphs & Export Period Selection):
- Added clearly labeled income and expense trend graphs for the same selected Stats date range.
- Stats CSV/PDF buttons now open a period picker before exporting, with Week, Month, Year, Custom, Financial Year, and All Time options.
- Report-period selection is independent of the current Stats filter; custom date ranges use the existing calendar with future dates blocked.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 29 complete (Complete Stats PDF Report):
- Stats PDF export now includes period income/expenses/net/daily average, top spending category, budget snapshot, category and account breakdowns, a printable income/expense trend graph, and both category donut charts.
- Added full transaction rows with transaction date/time, recorded timestamp, category, account, notes, and amount.
- Kept Stats PDF separate from the Transactions PDF and CSV export behavior.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 30 complete (Stats PDF Matches Selected View):
- Stats PDF export now starts with the currently selected Stats period instead of defaulting to a different range.
- The report includes the selected period's metrics, printable income/expense and category charts, category/account breakdowns, budget snapshot, and transaction detail rows.
- Preserved the existing Transactions PDF and CSV export behavior.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 31 complete (Restored Stats Graph Selector):
- Restored the familiar single-graph Stats layout with an Expense/Income selector above the trend chart.
- The selection controls both the trend graph and category breakdown; date-range filters and export flows remain intact.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 32 complete (PDF HTML Injection Fix):
- Escaped transaction category, account, and note text before inserting it into Transactions PDF HTML.
- Escaped the PDF period title so imported or otherwise untrusted text is rendered as plain text.
- Verified strict TypeScript compilation, targeted diagnostics, whitespace checks, and an Android bundle export.

Stage 33 complete (Android APK Build):
- Added an EAS internal preview profile that builds an installable Android APK.
- Linked the Expo project under the signed-in `ansh_21` account and generated Android signing credentials through EAS.
- Built the Android APK with EAS Build (build ID: `762738fb-c228-4581-a4f6-d738a567ef05`).
- Validated the Expo configuration and strict TypeScript compilation before the cloud build.

Stage 34 complete (Fixing APK Install Build):
- Removed the unsupported `newArchEnabled` app config field reported by Expo Doctor.
- Added Expo SDK-compatible `expo-font`, required by `@expo/vector-icons`.
- Expo Doctor now passes all 21 checks; strict TypeScript compilation also passes.
- Built a fresh Android APK with EAS (build ID: `d06c1373-4b59-4005-86aa-ceb9a6a4f594`).
