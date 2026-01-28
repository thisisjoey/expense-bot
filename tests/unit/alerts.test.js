import { jest } from '@jest/globals';

describe('generateAlerts Function', () => {
  let generateAlerts;

  beforeEach(() => {
    // Define the generateAlerts function for testing
    generateAlerts = async (budgets, expenses, timeframe = 'monthly') => {
      const categories = Object.keys(budgets);
      if (!categories.length) {
        return {
          hasAlerts: false,
          message: `📊 <b>No Categories</b>\n\nUse /addcategory to create categories first.`,
        };
      }

      const activeExpenses = expenses.filter((e) => !e.discarded);
      
      const nowUTC = new Date();
      const nowIST = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const currentDay = nowIST.getDate();
      const currentMonth = nowIST.getMonth();
      const currentYear = nowIST.getFullYear();
      
      let startDate;
      let budgetMultiplier = 1;
      let periodName = '';
      
      if (timeframe === 'daily') {
        startDate = new Date(currentYear, currentMonth, currentDay);
        budgetMultiplier = 1 / 30;
        periodName = 'Today';
      } else if (timeframe === 'weekly') {
        const dayOfWeek = nowIST.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(currentYear, currentMonth, currentDay - daysToMonday);
        budgetMultiplier = 7 / 30;
        periodName = 'This Week';
      } else {
        startDate = new Date(currentYear, currentMonth, 1);
        budgetMultiplier = 1;
        periodName = 'This Month';
      }

      const critical = [];
      const warning = [];
      const watch = [];
      const healthy = [];

      for (const cat of categories) {
        const monthlyBudget = budgets[cat];
        const periodBudget = monthlyBudget * budgetMultiplier;
        
        const spent = activeExpenses
          .filter((e) => e.category === cat && new Date(e.ts) >= startDate)
          .reduce((sum, e) => sum + e.amount, 0);
        
        const percent = periodBudget > 0 ? (spent / periodBudget) * 100 : 0;
        const remaining = periodBudget - spent;

        const line = `<b>${cat}</b>\n   ₹${spent.toFixed(0)}/₹${periodBudget.toFixed(0)} (${percent.toFixed(0)}%)\n   Left: ₹${remaining.toFixed(0)}`;

        if (percent >= 90) {
          critical.push(`🚨 ${line}`);
        } else if (percent >= 75) {
          warning.push(`⚠️ ${line}`);
        } else if (percent >= 50) {
          watch.push(`📊 ${line}`);
        } else {
          healthy.push(`✅ ${line}`);
        }
      }

      const sections = [];
      
      if (critical.length > 0) {
        sections.push(`<b>🚨 CRITICAL (≥90%)</b>\n${critical.join('\n\n')}`);
      }
      
      if (warning.length > 0) {
        sections.push(`<b>⚠️ WARNING (≥75%)</b>\n${warning.join('\n\n')}`);
      }
      
      if (watch.length > 0) {
        sections.push(`<b>📊 WATCH (≥50%)</b>\n${watch.join('\n\n')}`);
      }
      
      if (healthy.length > 0) {
        sections.push(`<b>✅ HEALTHY (&lt;50%)</b>\n${healthy.join('\n\n')}`);
      }

      const hasAlerts = critical.length > 0 || warning.length > 0;
      
      let emoji = '✅';
      if (critical.length > 0) emoji = '🚨';
      else if (warning.length > 0) emoji = '⚠️';
      else if (watch.length > 0) emoji = '📊';

      const totalBudget = Object.values(budgets).reduce((sum, b) => sum + b, 0);
      const totalSpent = activeExpenses
        .filter((e) => new Date(e.ts) >= startDate)
        .reduce((sum, e) => sum + e.amount, 0);
      const totalRemaining = totalBudget - totalSpent;
      const totalPercent = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0;

      const message = `${emoji} <b>Budget Alert - ${periodName}</b>\n\n💼 <b>Overall Budget</b>\n   Spent: ₹${totalSpent.toFixed(0)} / ₹${totalBudget}\n   Left: ₹${totalRemaining.toFixed(0)} (${totalPercent}%)\n\n${sections.join('\n\n')}`;

      return {
        hasAlerts,
        critical: critical.length,
        warning: warning.length,
        watch: watch.length,
        healthy: healthy.length,
        message,
      };
    };
  });

  describe('with no categories', () => {
    it('should return no categories message', async () => {
      const result = await generateAlerts({}, []);
      
      expect(result.hasAlerts).toBe(false);
      expect(result.message).toContain('No Categories');
      expect(result.message).toContain('/addcategory');
    });
  });

  describe('monthly alerts', () => {
    it('should categorize as healthy when spending < 50%', async () => {
      const budgets = { food: 1000, travel: 2000 };
      const expenses = [
        { category: 'food', amount: 400, ts: new Date().toISOString(), discarded: false },
        { category: 'travel', amount: 800, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.healthy).toBe(2);
      expect(result.watch).toBe(0);
      expect(result.warning).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.hasAlerts).toBe(false);
    });

    it('should categorize as watch when spending >= 50%', async () => {
      const budgets = { food: 1000 };
      const expenses = [
        { category: 'food', amount: 550, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.watch).toBe(1);
      expect(result.hasAlerts).toBe(false);
    });

    it('should categorize as warning when spending >= 75%', async () => {
      const budgets = { food: 1000 };
      const expenses = [
        { category: 'food', amount: 800, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.warning).toBe(1);
      expect(result.hasAlerts).toBe(true);
    });

    it('should categorize as critical when spending >= 90%', async () => {
      const budgets = { food: 1000 };
      const expenses = [
        { category: 'food', amount: 950, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.critical).toBe(1);
      expect(result.hasAlerts).toBe(true);
    });

    it('should exclude discarded expenses', async () => {
      const budgets = { food: 1000 };
      const expenses = [
        { category: 'food', amount: 400, ts: new Date().toISOString(), discarded: false },
        { category: 'food', amount: 600, ts: new Date().toISOString(), discarded: true },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.healthy).toBe(1);
      expect(result.message).toContain('₹400');
    });

    it('should filter by current month', async () => {
      const budgets = { food: 1000 };
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const expenses = [
        { category: 'food', amount: 400, ts: new Date().toISOString(), discarded: false },
        { category: 'food', amount: 600, ts: lastMonth.toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.message).toContain('₹400');
      // The total should only include current month expenses
      expect(result.message).toContain('40%'); // 400/1000 = 40%
    });
  });

  describe('daily alerts', () => {
    it('should calculate daily budget correctly', async () => {
      const budgets = { food: 3000 }; // 3000/30 = 100 per day
      const expenses = [
        { category: 'food', amount: 50, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'daily');

      expect(result.message).toContain('Today');
      // Should show daily spending
      expect(result.message).toContain('₹50');
      expect(result.message).toContain('₹100');
    });

    it('should trigger critical alert for daily overspending', async () => {
      const budgets = { food: 3000 }; // 3000/30 = 100 per day
      const expenses = [
        { category: 'food', amount: 95, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'daily');

      expect(result.critical).toBe(1);
      expect(result.hasAlerts).toBe(true);
    });
  });

  describe('weekly alerts', () => {
    it('should calculate weekly budget correctly', async () => {
      const budgets = { food: 3000 }; // (3000 * 7) / 30 = 700 per week
      const expenses = [
        { category: 'food', amount: 300, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'weekly');

      expect(result.message).toContain('This Week');
      expect(result.healthy).toBe(1);
    });

    it('should filter expenses from this week only', async () => {
      const budgets = { food: 3000 };
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 10);
      
      const expenses = [
        { category: 'food', amount: 300, ts: new Date().toISOString(), discarded: false },
        { category: 'food', amount: 500, ts: lastWeek.toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'weekly');

      expect(result.message).toContain('₹300');
    });
  });

  describe('message formatting', () => {
    it('should include overall budget summary', async () => {
      const budgets = { food: 1000, travel: 2000 };
      const expenses = [
        { category: 'food', amount: 400, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.message).toContain('Overall Budget');
      expect(result.message).toContain('₹400 / ₹3000');
    });

    it('should show correct emoji based on status', async () => {
      const budgets = { food: 1000 };
      
      // Critical
      let expenses = [{ category: 'food', amount: 950, ts: new Date().toISOString(), discarded: false }];
      let result = await generateAlerts(budgets, expenses);
      expect(result.message).toMatch(/^🚨/);

      // Warning
      expenses = [{ category: 'food', amount: 800, ts: new Date().toISOString(), discarded: false }];
      result = await generateAlerts(budgets, expenses);
      expect(result.message).toMatch(/^⚠️/);

      // Watch
      expenses = [{ category: 'food', amount: 550, ts: new Date().toISOString(), discarded: false }];
      result = await generateAlerts(budgets, expenses);
      expect(result.message).toMatch(/^📊/);

      // Healthy
      expenses = [{ category: 'food', amount: 400, ts: new Date().toISOString(), discarded: false }];
      result = await generateAlerts(budgets, expenses);
      expect(result.message).toMatch(/^✅/);
    });

    it('should format amounts correctly', async () => {
      const budgets = { food: 1000 };
      const expenses = [
        { category: 'food', amount: 456.789, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses, 'monthly');

      expect(result.message).toContain('₹457');
      expect(result.message).toContain('₹543');
    });
  });

  describe('edge cases', () => {
    it('should handle zero budget', async () => {
      const budgets = { food: 0 };
      const expenses = [
        { category: 'food', amount: 100, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses);

      expect(result.message).toBeDefined();
      expect(result.message).toContain('food');
    });

    it('should handle no expenses', async () => {
      const budgets = { food: 1000 };
      const expenses = [];

      const result = await generateAlerts(budgets, expenses);

      expect(result.healthy).toBe(1);
      expect(result.message).toContain('₹0/₹1000');
    });

    it('should handle multiple categories with mixed statuses', async () => {
      const budgets = { 
        food: 1000,
        travel: 1000,
        shopping: 1000,
        entertainment: 1000,
      };
      const expenses = [
        { category: 'food', amount: 950, ts: new Date().toISOString(), discarded: false },
        { category: 'travel', amount: 800, ts: new Date().toISOString(), discarded: false },
        { category: 'shopping', amount: 550, ts: new Date().toISOString(), discarded: false },
        { category: 'entertainment', amount: 300, ts: new Date().toISOString(), discarded: false },
      ];

      const result = await generateAlerts(budgets, expenses);

      expect(result.critical).toBe(1);
      expect(result.warning).toBe(1);
      expect(result.watch).toBe(1);
      expect(result.healthy).toBe(1);
      expect(result.hasAlerts).toBe(true);
    });
  });
});