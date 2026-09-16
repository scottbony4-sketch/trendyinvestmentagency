function toNairobiDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(date);
}

function addDaysToDateKey(dateKey, days) {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getWithdrawalUnlockOffset(durationDays) {
  const days = Number(durationDays || 0);
  if (days <= 7) return 1;
  if (days <= 17) return 7;
  if (days <= 28) return 21;
  return 1;
}

export function getWithdrawalUnlockDate(startAt, durationDays) {
  const startKey = toNairobiDateKey(startAt);
  if (!startKey) return null;
  const offset = getWithdrawalUnlockOffset(durationDays);
  return addDaysToDateKey(startKey, offset - 1);
}

export function getWithdrawalUnlockState(startAt, durationDays, now = new Date()) {
  const unlockDateKey = getWithdrawalUnlockDate(startAt, durationDays);
  const todayKey = toNairobiDateKey(now);
  return {
    unlockDateKey,
    todayKey,
    isUnlocked: Boolean(unlockDateKey && todayKey && todayKey >= unlockDateKey),
  };
}

export function calculateInvestmentPlanMetrics({ amount, roiPercent, durationDays }) {
  const principal = Number(amount || 0);
  const percent = Number(roiPercent || 0);
  const duration = Math.max(1, Number(durationDays || 0));

  const totalProfit = Math.round(principal * (percent / 100));
  const totalReturn = principal + totalProfit;
  const baseDaily = Math.floor(totalReturn / duration);
  const remainder = totalReturn - (baseDaily * duration);
  const dailyEarning = baseDaily;
  const finalDayEarning = dailyEarning + remainder;

  return {
    principal,
    roiPercent: percent,
    durationDays: duration,
    totalProfit,
    totalReturn,
    dailyEarning,
    finalDayEarning,
    dailySchedule: Array.from({ length: duration }, (_, index) => ({
      day: index + 1,
      amount: index + 1 === duration ? finalDayEarning : dailyEarning,
    })),
  };
}

export function aggregateInvestmentEarnings(investment, dailyEarningRows = [], now = new Date()) {
  const rows = Array.isArray(dailyEarningRows) ? dailyEarningRows : [];
  const todayKey = toNairobiDateKey(now);
  const uniqueRows = [];
  const seen = new Set();

  for (const row of rows) {
    if (!row || row.investment_id !== investment?.id) continue;
    const key = `${row.investment_id}:${row.earning_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  const unlockState = getWithdrawalUnlockState(investment?.start_at || investment?.created_at, investment?.duration_days, now);

  const accumulated = uniqueRows
    .filter((row) => row.earning_date && (!todayKey || row.earning_date <= todayKey))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const withdrawable = uniqueRows
    .filter((row) => {
      if (!row.earning_date || (todayKey && row.earning_date > todayKey)) return false;
      return Boolean(row.added_to_balance || unlockState.isUnlocked);
    })
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const locked = Math.max(0, accumulated - withdrawable);
  const nextEarningDate = (() => {
    const knownDates = uniqueRows.map((row) => row.earning_date).sort();
    if (knownDates.length === 0) {
      return getWithdrawalUnlockDate(investment?.start_at || investment?.created_at, investment?.duration_days);
    }
    const lastDate = knownDates[knownDates.length - 1];
    if (!lastDate) return null;
    return addDaysToDateKey(lastDate, 1);
  })();

  return {
    accumulated,
    withdrawable,
    locked,
    nextEarningDate,
    unlockDateKey: unlockState.unlockDateKey,
    isUnlocked: unlockState.isUnlocked,
  };
}

export function summarizePortfolioBalance(profileBalance = 0, investmentSummaries = []) {
  const availableBalance = Number(profileBalance || 0);
  const accumulatedEarnings = investmentSummaries.reduce((sum, investment) => sum + Number(investment?.accumulated || 0), 0);
  const withdrawableEarnings = investmentSummaries.reduce((sum, investment) => sum + Number(investment?.withdrawable || 0), 0);
  const lockedEarnings = investmentSummaries.reduce((sum, investment) => sum + Number(investment?.locked || 0), 0);

  return {
    availableBalance,
    accumulatedEarnings,
    withdrawableEarnings,
    lockedEarnings,
  };
}

export function getAvailableWithdrawalBalance(profileBalance = 0) {
  return Math.max(0, Number(profileBalance || 0));
}

export function getPlanProgress(startAt, endAt, durationDays, now = new Date()) {
  const startMs = startAt ? Date.parse(startAt) : Number.NaN;
  if (!Number.isFinite(startMs)) return 0;

  const duration = Math.max(1, Number(durationDays || 0));
  const fallbackEndMs = startMs + duration * 86400000;
  const endMs = endAt ? Date.parse(endAt) : fallbackEndMs;

  if (!Number.isFinite(endMs)) return 0;

  const total = endMs - startMs;
  if (total <= 0) return 100;

  const elapsed = now.getTime() - startMs;
  if (elapsed <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function getWithdrawalAvailabilityReason(balance, minWithdrawalAmount, investmentMetrics = []) {
  const availableBalance = Number(balance || 0);
  const minimum = Number(minWithdrawalAmount || 0);
  if (availableBalance >= minimum) {
    return null;
  }

  const hasLockedPlans = investmentMetrics.some((metric) => metric && metric.locked > 0 && !metric.isUnlocked);
  if (hasLockedPlans) {
    return "Your available balance is below the minimum withdrawal amount. Earnings from locked plans become withdrawable on their unlock date.";
  }

  return `Minimum withdrawal is KSh ${minimum}.`;
}
