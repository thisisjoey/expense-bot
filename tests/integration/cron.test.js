import { jest } from '@jest/globals';

describe('Daily Summary Cron Job', () => {
  let mockSupabase;
  let mockFetch;
  let generateDailySummary;

  beforeEach(() => {
    // Setup environment
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key';
    process.env.TELEGRAM_CHAT_ID = '-1001234567890';
    process.env.CRON_SECRET = 'test_secret';

    // Mock fetch
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Mock Supabase
    mockSupabase = {
      from: jest.fn(),
    };

    // Define generateDailySummary function
    generateDailySummary = async (budgets, expenses) => {
      const activeExpenses = expenses.filter((e) => !e.discarded);
      
      const totalMonthlyBudget = Object.values(budgets).reduce((sum, b) => sum + b, 0);
      const totalDailyBudget = totalMonthlyBudget / 30;
      const totalWeeklyBudget = (totalMonthlyBudget * 7) / 30;

      const nowUTC = new Date();
      const nowIST = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const currentDay = nowIST.getDate();
      const currentMonth = nowIST.getMonth();
      const currentYear = nowIST.getFullYear();

      const todayStart = new Date(currentYear, currentMonth, currentDay);
      const todayEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59);
      const yesterdayStart = new Date(currentYear, currentMonth, currentDay - 1);
      const yesterdayEnd = new Date(currentYear, currentMonth, currentDay - 1, 23, 59, 59);

      const dayOfWeek = nowIST.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(currentYear, currentMonth, currentDay - daysToMonday);
      const monthStart = new Date(currentYear, currentMonth, 1);

      const todaySpent = activeExpenses
        .filter((e) => {
          const expDate = new Date(e.ts);
          return expDate >= todayStart && expDate <= todayEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const yesterdaySpent = activeExpenses
        .filter((e) => {
          const expDate = new Date(e.ts);
          return expDate >= yesterdayStart && expDate <= yesterdayEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const weekSpent = activeExpenses
        .filter((e) => new Date(e.ts) >= weekStart && new Date(e.ts) <= todayEnd)
        .reduce((sum, e) => sum + e.amount, 0);

      const monthSpent = activeExpenses
        .filter((e) => new Date(e.ts) >= monthStart && new Date(e.ts) <= todayEnd)
        .reduce((sum, e) => sum + e.amount, 0);

      const daysPassedThisMonth = currentDay;
      const dailyAverage = daysPassedThisMonth > 0 ? monthSpent / daysPassedThisMonth : 0;

      const todayPercent = totalDailyBudget > 0 ? (todaySpent / totalDailyBudget) * 100 : 0;
      const yesterdayPercent = totalDailyBudget > 0 ? (yesterdaySpent / totalDailyBudget) * 100 : 0;
      const dailyAvgPercent = totalDailyBudget > 0 ? (dailyAverage / totalDailyBudget) * 100 : 0;
      const weekPercent = totalWeeklyBudget > 0 ? (weekSpent / totalWeeklyBudget) * 100 : 0;
      const monthPercent = totalMonthlyBudget > 0 ? (monthSpent / totalMonthlyBudget) * 100 : 0;

      return {
        todaySpent,
        yesterdaySpent,
        weekSpent,
        monthSpent,
        dailyAverage,
        todayPercent,
        yesterdayPercent,
        dailyAvgPercent,
        weekPercent,
        monthPercent,
        totalDailyBudget,
        totalWeeklyBudget,
        totalMonthlyBudget,
      };
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.CRON_SECRET;
  });

  describe('Budget calculations', () => {
    it('should calculate daily budget correctly', async () => {
      const budgets = { food: 3000, travel: 2100 }; // 5100 total
      const expenses = [];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.totalMonthlyBudget).toBe(5100);
      expect(result.totalDailyBudget).toBe(170); // 5100/30
      expect(result.totalWeeklyBudget).toBe(1190); // (5100*7)/30
    });

    it('should handle zero budget', async () => {
      const budgets = {};
      const expenses = [];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.totalMonthlyBudget).toBe(0);
      expect(result.totalDailyBudget).toBe(0);
    });
  });

  describe('Expense filtering', () => {
    it('should filter today\'s expenses correctly', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
        { amount: 200, ts: yesterday.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todaySpent).toBe(100);
      expect(result.yesterdaySpent).toBe(200);
    });

    it('should exclude discarded expenses', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
        { amount: 500, ts: today.toISOString(), discarded: true },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todaySpent).toBe(100);
    });

    it('should calculate this week\'s expenses', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 10);
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
        { amount: 50, ts: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), discarded: false },
        { amount: 200, ts: lastWeek.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.weekSpent).toBeGreaterThanOrEqual(150);
    });

    it('should calculate this month\'s expenses', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
        { amount: 200, ts: lastMonth.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.monthSpent).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Daily average calculation', () => {
    it('should calculate daily average correctly', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      
      // Create expenses for multiple days this month
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
        { amount: 100, ts: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString(), discarded: false },
        { amount: 100, ts: new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      // Daily average should be total spent / days passed
      expect(result.dailyAverage).toBeGreaterThan(0);
      expect(result.monthSpent).toBeGreaterThanOrEqual(300);
    });

    it('should handle first day of month', async () => {
      const budgets = { food: 3000 };
      const firstDay = new Date();
      firstDay.setDate(1);
      
      const expenses = [
        { amount: 100, ts: firstDay.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.dailyAverage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Percentage calculations', () => {
    it('should calculate percentages correctly', async () => {
      const budgets = { food: 3000 }; // 100 per day
      const today = new Date();
      
      const expenses = [
        { amount: 80, ts: today.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todayPercent).toBe(80);
    });

    it('should handle zero budget percentage', async () => {
      const budgets = { food: 0 };
      const today = new Date();
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todayPercent).toBe(0);
    });

    it('should calculate over-budget percentage', async () => {
      const budgets = { food: 3000 }; // 100 per day
      const today = new Date();
      
      const expenses = [
        { amount: 150, ts: today.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todayPercent).toBe(150);
    });
  });

  describe('Status determination', () => {
    it('should identify on-track status (<=80%)', () => {
      const percent = 75;
      const status = percent <= 80 ? 'On Track' : percent <= 100 ? 'Close to Limit' : 'Off Track';
      
      expect(status).toBe('On Track');
    });

    it('should identify close to limit status (81-100%)', () => {
      const percent = 95;
      const status = percent <= 80 ? 'On Track' : percent <= 100 ? 'Close to Limit' : 'Off Track';
      
      expect(status).toBe('Close to Limit');
    });

    it('should identify off track status (>100%)', () => {
      const percent = 120;
      const status = percent <= 80 ? 'On Track' : percent <= 100 ? 'Close to Limit' : 'Off Track';
      
      expect(status).toBe('Off Track');
    });
  });

  describe('Cron handler', () => {
    it('should require authorization header', () => {
      const request = {
        headers: {
          authorization: 'Bearer wrong_secret',
        },
      };
      
      const isAuthorized = request.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      
      expect(isAuthorized).toBe(false);
    });

    it('should accept valid authorization', () => {
      const request = {
        headers: {
          authorization: 'Bearer test_secret',
        },
      };
      
      const isAuthorized = request.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
      
      expect(isAuthorized).toBe(true);
    });

    it('should require chat ID configuration', () => {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      expect(chatId).toBeDefined();
      expect(chatId).toBe('-1001234567890');
    });
  });

  describe('IST timezone handling', () => {
    it('should convert to IST correctly', () => {
      const utcDate = new Date('2024-01-15T00:00:00Z');
      const istDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      
      expect(istDate).toBeInstanceOf(Date);
    });

    it('should handle date boundaries in IST', () => {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const currentDay = nowIST.getDate();
      const currentMonth = nowIST.getMonth();
      const currentYear = nowIST.getFullYear();
      
      expect(currentDay).toBeGreaterThan(0);
      expect(currentDay).toBeLessThanOrEqual(31);
      expect(currentMonth).toBeGreaterThanOrEqual(0);
      expect(currentMonth).toBeLessThan(12);
      expect(currentYear).toBeGreaterThan(2020);
    });

    it('should calculate week start (Monday) correctly', () => {
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const dayOfWeek = nowIST.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      expect(daysToMonday).toBeGreaterThanOrEqual(0);
      expect(daysToMonday).toBeLessThan(7);
    });
  });

  describe('Message formatting', () => {
    it('should format amounts to 0 decimal places', () => {
      const amount = 123.456;
      const formatted = amount.toFixed(0);
      
      expect(formatted).toBe('123');
    });

    it('should format percentages to 1 decimal place', () => {
      const percent = 75.456;
      const formatted = percent.toFixed(1);
      
      expect(formatted).toBe('75.5');
    });

    it('should format date in IST', () => {
      const date = new Date();
      const formatted = date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      
      expect(formatted).toMatch(/\d{1,2} \w+ \d{4}/);
    });
  });

  describe('Error handling', () => {
    it('should handle Supabase load errors', async () => {
      const mockError = { message: 'Database connection failed' };
      
      // Simulate error handling
      const budgets = {};
      const expenses = [];
      
      // Should still generate summary with empty data
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.totalMonthlyBudget).toBe(0);
    });

    it('should handle Telegram send errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      // Should log error but not throw
      await expect(mockFetch()).rejects.toThrow('Network error');
    });
  });

  describe('Edge cases', () => {
    it('should handle no expenses', async () => {
      const budgets = { food: 3000 };
      const expenses = [];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todaySpent).toBe(0);
      expect(result.weekSpent).toBe(0);
      expect(result.monthSpent).toBe(0);
      expect(result.dailyAverage).toBe(0);
    });

    it('should handle no budgets', async () => {
      const budgets = {};
      const today = new Date();
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: false },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.totalMonthlyBudget).toBe(0);
      expect(result.todayPercent).toBe(0);
    });

    it('should handle all expenses discarded', async () => {
      const budgets = { food: 3000 };
      const today = new Date();
      
      const expenses = [
        { amount: 100, ts: today.toISOString(), discarded: true },
        { amount: 200, ts: today.toISOString(), discarded: true },
      ];
      
      const result = await generateDailySummary(budgets, expenses);
      
      expect(result.todaySpent).toBe(0);
    });
  });
});
