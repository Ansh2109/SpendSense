import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File as EXFile, Paths } from 'expo-file-system';
import { TransactionWithDetails } from '../db/repositories/transactionRepository';
import { formatPaiseToINR, paiseToRupees } from '../utils/money';

interface StatsReportOptions {
  dateRange: { start: string; end: string };
  budget: {
    periodLabel: string;
    expensePaise: number;
    limitPaise: number;
  };
}

interface ReportBreakdown {
  name: string;
  amountPaise: number;
  percentage: number;
  color: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);

const createBreakdowns = (
  transactions: TransactionWithDetails[],
  type: 'income' | 'expense',
  keyFor: (transaction: TransactionWithDetails) => string,
  colorFor: (transaction: TransactionWithDetails) => string,
): ReportBreakdown[] => {
  const totals = new Map<string, { total: number; color: string }>();
  for (const transaction of transactions) {
    if (transaction.type !== type) continue;
    const name = keyFor(transaction);
    const current = totals.get(name) ?? { total: 0, color: colorFor(transaction) };
    current.total += transaction.amountPaise;
    totals.set(name, current);
  }
  const totalPaise = Array.from(totals.values()).reduce((sum, item) => sum + item.total, 0);
  return Array.from(totals.entries())
    .map(([name, item]) => ({
      name,
      amountPaise: item.total,
      percentage: totalPaise > 0 ? Math.round((item.total / totalPaise) * 100) : 0,
      color: /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : '#64748B',
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise);
};

const renderBreakdownTable = (items: ReportBreakdown[]): string =>
  items.length === 0
    ? '<p class="muted">No records for this period.</p>'
    : `<table class="breakdown-table"><tbody>${items.map((item) => `
      <tr>
        <td><span class="swatch" style="background:${item.color}"></span>${escapeHtml(item.name)}</td>
        <td>${item.percentage}%</td>
        <td class="amount">${formatPaiseToINR(item.amountPaise)}</td>
      </tr>`).join('')}</tbody></table>`;

const renderDonutChart = (items: ReportBreakdown[]): string => {
  if (items.length === 0) return '<p class="muted">No category data for this period.</p>';
  const circumference = 2 * Math.PI * 54;
  const total = items.reduce((sum, item) => sum + item.amountPaise, 0);
  let offset = 0;
  const segments = items.map((item) => {
    const length = circumference * item.amountPaise / total;
    const segment = `<circle cx="70" cy="70" r="54" fill="none" stroke="${item.color}" stroke-width="22" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" />`;
    offset += length;
    return segment;
  }).join('');
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Category distribution">
      <g transform="rotate(-90 70 70)">${segments}</g>
      <circle cx="70" cy="70" r="41" fill="#FFFFFF" />
      <text x="70" y="66" text-anchor="middle" class="donut-label">Total</text>
      <text x="70" y="83" text-anchor="middle" class="donut-total">${formatPaiseToINR(total)}</text>
    </svg>
    <div class="donut-legend">${items.map((item) => `
      <div class="legend-row"><span class="swatch" style="background:${item.color}"></span>
      <span>${escapeHtml(item.name)}</span><strong>${item.percentage}%</strong></div>`).join('')}
    </div>
  </div>`;
};

const renderTrendChart = (
  transactions: TransactionWithDetails[],
  dateRange: { start: string; end: string },
): string => {
  const [startYear, startMonth, startDay] = dateRange.start.split('-').map(Number);
  const [endYear, endMonth, endDay] = dateRange.end.split('-').map(Number);
  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);
  const spanDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const unit: 'day' | 'month' | 'year' = spanDays <= 31 ? 'day' : spanDays <= 800 ? 'month' : 'year';
  const cursor = unit === 'day'
    ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    : unit === 'month'
      ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      : new Date(startDate.getFullYear(), 0, 1);
  const buckets: { label: string; income: number; expense: number }[] = [];
  while (cursor <= endDate) {
    const next = new Date(cursor);
    if (unit === 'day') next.setDate(next.getDate() + 1);
    else if (unit === 'month') next.setMonth(next.getMonth() + 1);
    else next.setFullYear(next.getFullYear() + 1);
    const totals = { income: 0, expense: 0 };
    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      if (Number.isNaN(date.getTime()) || date < cursor || date >= next) continue;
      totals[transaction.type] += transaction.amountPaise;
    }
    const label = unit === 'day'
      ? cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : unit === 'month'
        ? cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        : String(cursor.getFullYear());
    buckets.push({ label, income: paiseToRupees(totals.income), expense: paiseToRupees(totals.expense) });
    cursor.setTime(next.getTime());
  }
  const width = 760;
  const height = 260;
  const left = 46;
  const right = 14;
  const top = 20;
  const bottom = 48;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maximum = Math.max(1, ...buckets.flatMap((bucket) => [bucket.income, bucket.expense]));
  const slotWidth = plotWidth / Math.max(1, buckets.length);
  const barWidth = Math.max(2, Math.min(14, slotWidth * 0.3));
  const labelStep = Math.max(1, Math.ceil(buckets.length / 12));
  const gridLines = [0, 0.5, 1].map((ratio) => {
    const y = top + plotHeight * ratio;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#E2E8F0" />
      <text x="${left - 6}" y="${y + 4}" text-anchor="end" class="axis-label">${Math.round(maximum * (1 - ratio)).toLocaleString('en-IN')}</text>`;
  }).join('');
  const bars = buckets.map((bucket, index) => {
    const center = left + slotWidth * index + slotWidth / 2;
    const incomeHeight = plotHeight * bucket.income / maximum;
    const expenseHeight = plotHeight * bucket.expense / maximum;
    const label = index % labelStep === 0 || index === buckets.length - 1
      ? `<text x="${center}" y="${height - 20}" text-anchor="middle" class="axis-label">${escapeHtml(bucket.label)}</text>`
      : '';
    return `<rect x="${center - barWidth - 1}" y="${top + plotHeight - incomeHeight}" width="${barWidth}" height="${Math.max(0, incomeHeight)}" rx="2" fill="#059669" />
      <rect x="${center + 1}" y="${top + plotHeight - expenseHeight}" width="${barWidth}" height="${Math.max(0, expenseHeight)}" rx="2" fill="#DC2626" />${label}`;
  }).join('');
  return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Income and expense trend">
    ${gridLines}${bars}
  </svg>`;
};

const saveAndSharePdf = async (html: string, filename: string, dialogTitle: string): Promise<void> => {
  const { base64 } = await Print.printToFileAsync({ html, base64: true });
  if (!base64) throw new Error('PDF data was not created.');
  const savedFile = new EXFile(Paths.document, `${filename}_${Date.now()}.pdf`);
  savedFile.write(base64, { encoding: 'base64' });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(savedFile.uri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: '.pdf',
    });
  } else {
    alert(`PDF saved to device: ${savedFile.uri}`);
  }
};

export const reportService = {
  /**
   * Generates a CSV string and saves/shares it.
   * Uses expo-file-system v57 new File/Paths API.
   */
  exportCSV: async (transactions: TransactionWithDetails[], title = 'SpendSense_Report'): Promise<void> => {
    try {
      const headers = ['ID', 'Date', 'Type', 'Category', 'Account', 'Amount (INR)', 'Notes'];
      const rows = transactions.map((t) => [
        t.id,
        t.date ? new Date(t.date).toLocaleDateString('en-IN') : '',
        t.type.toUpperCase(),
        `"${t.categoryName.replace(/"/g, '""')}"`,
        `"${t.accountName.replace(/"/g, '""')}"`,
        paiseToRupees(t.amountPaise).toFixed(2),
        `"${(t.note || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const filename = `${title}_${Date.now()}.csv`;

      // expo-file-system v57: use File class with Paths.document directory
      const file = new EXFile(Paths.document, filename);
      file.write(csvContent);

      const fileUri = file.uri;
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Share CSV Report',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        alert(`CSV saved to device: ${fileUri}`);
      }
    } catch (error) {
      console.error('Error generating CSV report:', error);
      throw error;
    }
  },

  exportStatsPDF: async (
    transactions: TransactionWithDetails[],
    periodTitle: string,
    options: StatsReportOptions,
  ): Promise<void> => {
    try {
      const income = transactions
        .filter((transaction) => transaction.type === 'income')
        .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
      const expenses = transactions
        .filter((transaction) => transaction.type === 'expense')
        .reduce((sum, transaction) => sum + transaction.amountPaise, 0);
      const net = income - expenses;
      const [startYear, startMonth, startDay] = options.dateRange.start.split('-').map(Number);
      const [endYear, endMonth, endDay] = options.dateRange.end.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      const dayCount = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
      const dailyAveragePaise = Math.round(expenses / dayCount);
      const expenseCategories = createBreakdowns(
        transactions,
        'expense',
        (transaction) => transaction.categoryName,
        (transaction) => transaction.categoryColor,
      );
      const incomeCategories = createBreakdowns(
        transactions,
        'income',
        (transaction) => transaction.categoryName,
        (transaction) => transaction.categoryColor,
      );
      const expenseAccounts = createBreakdowns(
        transactions,
        'expense',
        (transaction) => transaction.accountName,
        () => '#DC2626',
      );
      const incomeAccounts = createBreakdowns(
        transactions,
        'income',
        (transaction) => transaction.accountName,
        () => '#059669',
      );
      const expenseDonut = renderDonutChart(expenseCategories);
      const incomeDonut = renderDonutChart(incomeCategories);
      const topExpenseCategory = expenseCategories[0] ?? null;
      const generatedAt = new Date().toLocaleString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const transactionRows = transactions.map((transaction) => {
        const date = new Date(transaction.date);
        const recordedAt = new Date(transaction.createdAt);
        const dateTime = Number.isNaN(date.getTime())
          ? 'Unknown date'
          : `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        const recordedLabel = Number.isNaN(recordedAt.getTime())
          ? ''
          : recordedAt.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
        return `<tr>
          <td>${dateTime}${recordedLabel ? `<small>Recorded ${recordedLabel}</small>` : ''}</td>
          <td>${escapeHtml(transaction.type === 'income' ? 'Income' : 'Expense')}</td>
          <td>${escapeHtml(transaction.categoryName)}</td>
          <td>${escapeHtml(transaction.accountName)}</td>
          <td>${escapeHtml(transaction.note ?? '-')}</td>
          <td class="amount ${transaction.type === 'income' ? 'positive' : 'negative'}">${transaction.type === 'income' ? '+' : '-'}${formatPaiseToINR(transaction.amountPaise)}</td>
        </tr>`;
      }).join('');
      const budgetPercent = options.budget.limitPaise > 0
        ? Math.round(options.budget.expensePaise / options.budget.limitPaise * 100)
        : 0;
      const budgetRemainingPaise = options.budget.limitPaise - options.budget.expensePaise;

      const html = `<!DOCTYPE html>
        <html><head><meta charset="utf-8" /><title>SpendSense Stats Report</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 26px; color: #0F172A; background: #fff; }
          h1 { margin: 0; color: #047857; font-size: 26px; }
          h2 { margin: 0 0 12px; font-size: 17px; color: #0F172A; }
          h3 { margin: 0 0 10px; font-size: 14px; color: #334155; }
          .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #D1FAE5; padding-bottom: 16px; margin-bottom: 18px; }
          .muted, .subtitle { color: #64748B; font-size: 11px; }
          .subtitle { margin-top: 4px; }
          .generated { text-align: right; color: #64748B; font-size: 11px; line-height: 1.6; }
          .cards { display: flex; gap: 10px; margin: 16px 0; }
          .metric { flex: 1; min-width: 0; border: 1px solid #E2E8F0; background: #F8FAFC; border-radius: 8px; padding: 12px; }
          .metric-label { color: #64748B; font-size: 10px; text-transform: uppercase; font-weight: 700; }
          .metric-value { margin-top: 5px; font-size: 18px; font-weight: 800; }
          .positive { color: #059669; } .negative { color: #DC2626; }
          .highlight { border-left: 4px solid #F59E0B; background: #FFFBEB; border-radius: 5px; padding: 10px 12px; margin: 12px 0; font-size: 12px; }
          .section { margin-top: 20px; page-break-inside: avoid; }
          .chart-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin: 10px 0; page-break-inside: avoid; }
          .trend-chart { width: 100%; height: auto; display: block; }
          .axis-label { font: 10px Arial, sans-serif; fill: #64748B; }
          .legend { display: flex; justify-content: center; gap: 22px; font-size: 11px; color: #475569; margin: 8px; }
          .legend span::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #059669; margin-right: 6px; }
          .legend .expense-key::before { background: #DC2626; }
          .donut-wrap { display: flex; align-items: center; gap: 16px; }
          .donut { width: 140px; min-width: 140px; height: 140px; }
          .donut-label { font: 10px Arial, sans-serif; fill: #64748B; }
          .donut-total { font: bold 11px Arial, sans-serif; fill: #0F172A; }
          .donut-legend { flex: 1; }
          .legend-row { display: flex; align-items: center; gap: 7px; padding: 5px 0; border-bottom: 1px solid #F1F5F9; font-size: 11px; }
          .legend-row span:nth-child(2) { flex: 1; }
          .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: 0 0 9px; }
          .breakdown-table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .breakdown-table td { padding: 6px; border-bottom: 1px solid #E2E8F0; }
          .breakdown-table td:first-child { width: 58%; }
          .breakdown-table .swatch { margin-right: 7px; }
          .amount { white-space: nowrap; text-align: right; font-weight: 700; }
          table.transactions { width: 100%; border-collapse: collapse; font-size: 10px; }
          .transactions th { text-align: left; background: #F1F5F9; padding: 8px 6px; color: #475569; }
          .transactions td { vertical-align: top; padding: 7px 6px; border-bottom: 1px solid #E2E8F0; }
          .transactions small { display: block; color: #94A3B8; margin-top: 3px; }
          .budget-bar { margin-top: 8px; height: 9px; border-radius: 8px; background: #E2E8F0; overflow: hidden; }
          .budget-fill { height: 100%; background: ${budgetPercent > 100 ? '#DC2626' : '#059669'}; width: ${Math.min(budgetPercent, 100)}%; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; color: #94A3B8; text-align: center; font-size: 10px; }
          @media print { body { padding: 18px; } }
        </style></head><body>
          <div class="header">
            <div><h1>SpendSense</h1><div class="subtitle">Stats &amp; transaction report · ${escapeHtml(periodTitle)}</div></div>
            <div class="generated">Generated ${escapeHtml(generatedAt)}<br/>${transactions.length} transactions</div>
          </div>
          <div class="cards">
            <div class="metric"><div class="metric-label">Income</div><div class="metric-value positive">+${formatPaiseToINR(income)}</div></div>
            <div class="metric"><div class="metric-label">Expenses</div><div class="metric-value negative">-${formatPaiseToINR(expenses)}</div></div>
            <div class="metric"><div class="metric-label">Net savings</div><div class="metric-value ${net >= 0 ? 'positive' : 'negative'}">${formatPaiseToINR(net)}</div></div>
            <div class="metric"><div class="metric-label">Daily average spend</div><div class="metric-value">${formatPaiseToINR(dailyAveragePaise)}</div></div>
          </div>
          ${topExpenseCategory ? `<div class="highlight">Top spending category: <strong>${escapeHtml(topExpenseCategory.name)}</strong> · ${topExpenseCategory.percentage}% · ${formatPaiseToINR(topExpenseCategory.amountPaise)}</div>` : ''}
          <section class="section chart-card">
            <h2>Income &amp; expense trend</h2>
            <div class="legend"><span>Income</span><span class="expense-key">Expenses</span></div>
            ${renderTrendChart(transactions, options.dateRange)}
          </section>
          <section class="section chart-card"><h2>Expense categories</h2>
            ${expenseDonut}<h3>Expense category details</h3>${renderBreakdownTable(expenseCategories)}
          </section>
          <section class="section chart-card"><h2>Income sources</h2>
            ${incomeDonut}<h3>Income source details</h3>${renderBreakdownTable(incomeCategories)}
          </section>
          <section class="section chart-card"><h2>Account breakdown</h2>
            <h3>Expenses by account</h3>${renderBreakdownTable(expenseAccounts)}
            <h3 style="margin-top:14px">Income by account</h3>${renderBreakdownTable(incomeAccounts)}
          </section>
          <section class="section chart-card"><h2>${escapeHtml(options.budget.periodLabel)} budget snapshot</h2>
            <div class="cards">
              <div class="metric"><div class="metric-label">Spent</div><div class="metric-value">${formatPaiseToINR(options.budget.expensePaise)}</div></div>
              <div class="metric"><div class="metric-label">Limit</div><div class="metric-value">${options.budget.limitPaise > 0 ? formatPaiseToINR(options.budget.limitPaise) : 'Not set'}</div></div>
              <div class="metric"><div class="metric-label">${budgetRemainingPaise >= 0 ? 'Remaining' : 'Over budget'}</div><div class="metric-value ${budgetRemainingPaise < 0 ? 'negative' : ''}">${options.budget.limitPaise > 0 ? formatPaiseToINR(Math.abs(budgetRemainingPaise)) : '—'}</div></div>
            </div>
            ${options.budget.limitPaise > 0 ? `<div class="muted">${budgetPercent}% of limit used</div><div class="budget-bar"><div class="budget-fill"></div></div>` : '<div class="muted">Set a budget in Stats to track progress.</div>'}
          </section>
          <section class="section"><h2>Transactions</h2>
            <table class="transactions"><thead><tr><th>Date &amp; time</th><th>Type</th><th>Category</th><th>Account</th><th>Notes</th><th class="amount">Amount</th></tr></thead>
            <tbody>${transactionRows}</tbody></table>
          </section>
          <div class="footer">Generated by SpendSense · Personal finance summary</div>
        </body></html>`;

      await saveAndSharePdf(html, 'SpendSense_stats', 'Save or share Stats report');
    } catch (error) {
      console.error('Error generating Stats PDF report:', error);
      throw error;
    }
  },

  /**
   * Generates a styled HTML statement and prompts Print / Save as PDF.
   */
  exportPDF: async (
    transactions: TransactionWithDetails[],
    periodTitle = 'Financial Statement'
  ): Promise<void> => {
    try {
      const totalIncomePaise = transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amountPaise, 0);

      const totalExpensePaise = transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + t.amountPaise, 0);

      const netBalancePaise = totalIncomePaise - totalExpensePaise;
      const generatedDateTime = new Date();
      const generatedAt = `${generatedDateTime.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}, ${generatedDateTime.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })}`;

      const rowsHtml = transactions
        .map(
          (t) => {
            const transactionDate = new Date(t.date);
            const recordedDate = new Date(t.createdAt);
            return `
          <tr style="border-bottom: 1px solid #E2E8F0;">
            <td style="padding: 10px 8px; font-size: 13px; color: #475569;">
              <div>${transactionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div style="font-size: 11px; color: #64748B;">${transactionDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
              ${Number.isNaN(recordedDate.getTime()) ? '' : `<div style="font-size: 10px; color: #94A3B8; margin-top: 3px;">Recorded ${recordedDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</div>`}
            </td>
            <td style="padding: 10px 8px; font-size: 13px; font-weight: 600; color: #1E293B;">
              ${escapeHtml(t.categoryName)}
            </td>
            <td style="padding: 10px 8px; font-size: 13px; color: #64748B;">
              ${escapeHtml(t.accountName)}
            </td>
            <td style="padding: 10px 8px; font-size: 13px; color: #64748B;">
              ${escapeHtml(t.note || '-')}
            </td>
            <td style="padding: 10px 8px; font-size: 13px; font-weight: 700; text-align: right; color: ${
              t.type === 'income' ? '#10B981' : '#EF4444'
            };">
              ${t.type === 'income' ? '+' : '-'}${formatPaiseToINR(t.amountPaise)}
            </td>
          </tr>
        `;
          }
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>SpendSense Statement</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 28px; color: #1E293B; background: #FFFFFF; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #2563EB; padding-bottom: 16px; }
              .brand { font-size: 26px; font-weight: 800; color: #2563EB; letter-spacing: -0.5px; }
              .tagline { font-size: 12px; color: #64748B; margin-top: 2px; }
              .doc-info { text-align: right; font-size: 13px; color: #64748B; }
              .doc-title { font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
              
              .summary-cards { display: flex; gap: 12px; margin-bottom: 28px; }
              .card { flex: 1; padding: 14px 16px; border-radius: 8px; background: #F8FAFC; border: 1px solid #E2E8F0; }
              .card-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748B; margin-bottom: 4px; }
              .card-value { font-size: 20px; font-weight: 800; }
              .income-val { color: #10B981; }
              .expense-val { color: #EF4444; }
              .net-val { color: ${netBalancePaise >= 0 ? '#2563EB' : '#EF4444'}; }

              table { width: 100%; border-collapse: collapse; margin-top: 8px; }
              th { background: #F1F5F9; padding: 10px 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; color: #475569; text-align: left; }
              th.text-right { text-align: right; }
              .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #94A3B8; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <div class="brand">SpendSense</div>
                <div class="tagline">Personal Finance Report</div>
              </div>
              <div class="doc-info">
                <div class="doc-title">${escapeHtml(periodTitle)}</div>
                <div>Generated at ${generatedAt}</div>
                <div>Total Records: ${transactions.length}</div>
              </div>
            </div>

            <div class="summary-cards">
              <div class="card">
                <div class="card-label">Total Income</div>
                <div class="card-value income-val">+${formatPaiseToINR(totalIncomePaise)}</div>
              </div>
              <div class="card">
                <div class="card-label">Total Expenses</div>
                <div class="card-value expense-val">-${formatPaiseToINR(totalExpensePaise)}</div>
              </div>
              <div class="card">
                <div class="card-label">Net Balance</div>
                <div class="card-value net-val">${formatPaiseToINR(netBalancePaise)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th>Notes</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94A3B8;">No records found</td></tr>'}
              </tbody>
            </table>

            <div class="footer">
              Generated by SpendSense · All data is stored privately on your device.
            </div>
          </body>
        </html>
      `;

      const { base64 } = await Print.printToFileAsync({ html, base64: true });
      if (!base64) throw new Error('PDF data was not created.');
      // Android Sharing cannot read Expo Print's temporary URI directly.
      // Write the returned PDF data into our app document directory instead.
      const savedFile = new EXFile(Paths.document, `SpendSense_statement_${Date.now()}.pdf`);
      savedFile.write(base64, { encoding: 'base64' });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(savedFile.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share PDF statement',
          UTI: '.pdf',
        });
      } else {
        alert(`PDF saved to device: ${savedFile.uri}`);
      }
    } catch (error) {
      console.error('Error generating PDF report:', error);
      throw error;
    }
  },
};
