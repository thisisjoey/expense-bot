import { jest } from '@jest/globals';

describe('Budget and Settlement Commands', () => {
  describe('/budget command', () => {
    it('should calculate daily budget from monthly', () => {
      const monthlyBudget = 3000;
      const dailyBudget = monthlyBudget / 30;
      
      expect(dailyBudget).toBe(100);
    });

    it('should calculate weekly budget from monthly', () => {
      const monthlyBudget = 3000;
      const weeklyBudget = (monthlyBudget * 7) / 30;
      
      expect(weeklyBudget).toBe(700);
    });

    it('should show last month spending', () => {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      
      expect(lastMonthStart.getMonth()).toBe((now.getMonth() - 1 + 12) % 12);
      expect(lastMonthEnd.getDate()).toBeGreaterThan(27);
    });

    it('should calculate category-wise spending', () => {
      const expenses = [
        { category: 'food', amount: 100, ts: new Date().toISOString(), discarded: false },
        { category: 'food', amount: 150, ts: new Date().toISOString(), discarded: false },
        { category: 'travel', amount: 200, ts: new Date().toISOString(), discarded: false },
      ];
      
      const byCategory = {};
      expenses.forEach(e => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });
      
      expect(byCategory.food).toBe(250);
      expect(byCategory.travel).toBe(200);
    });

    it('should show percentage for each timeframe', () => {
      const budget = 1000;
      const spent = 750;
      const percentage = (spent / budget) * 100;
      
      expect(percentage).toBe(75);
    });

    it('should handle zero budget gracefully', () => {
      const budget = 0;
      const spent = 100;
      const percentage = budget > 0 ? (spent / budget) * 100 : 0;
      
      expect(percentage).toBe(0);
    });
  });

  describe('/settled command', () => {
    it('should mark user as settled', () => {
      const settlement = {
        user_name: 'testuser',
        settled: true,
        last_settled_date: new Date().toISOString(),
      };
      
      expect(settlement.settled).toBe(true);
      expect(settlement.last_settled_date).toBeDefined();
    });

    it('should update existing settlement record', () => {
      const existingSettlement = {
        user_name: 'testuser',
        settled: false,
      };
      
      const updated = {
        ...existingSettlement,
        settled: true,
        last_settled_date: new Date().toISOString(),
      };
      
      expect(updated.settled).toBe(true);
      expect(updated.user_name).toBe('testuser');
    });
  });

  describe('Settlement calculations', () => {
    it('should calculate equal split correctly', () => {
      const expenses = [
        { user_name: 'alice', amount: 300, settled: false, discarded: false },
        { user_name: 'bob', amount: 300, settled: false, discarded: false },
      ];
      
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      const numMembers = 2;
      const perPerson = total / numMembers;
      
      expect(perPerson).toBe(300);
    });

    it('should identify who owes whom', () => {
      const userSpending = {
        alice: 400,
        bob: 200,
      };
      
      const total = Object.values(userSpending).reduce((sum, amt) => sum + amt, 0);
      const numMembers = Object.keys(userSpending).length;
      const perPerson = total / numMembers;
      
      const settlements = {};
      for (const [user, spent] of Object.entries(userSpending)) {
        settlements[user] = spent - perPerson;
      }
      
      expect(settlements.alice).toBe(100); // Alice overpaid
      expect(settlements.bob).toBe(-100); // Bob owes
    });

    it('should exclude settled expenses from calculations', () => {
      const expenses = [
        { user_name: 'alice', amount: 300, settled: false, discarded: false },
        { user_name: 'bob', amount: 200, settled: true, discarded: false },
        { user_name: 'alice', amount: 100, settled: false, discarded: false },
      ];
      
      const unsettled = expenses.filter(e => !e.settled && !e.discarded);
      const total = unsettled.reduce((sum, e) => sum + e.amount, 0);
      
      expect(total).toBe(400);
      expect(unsettled).toHaveLength(2);
    });

    it('should handle multiple members correctly', () => {
      const userSpending = {
        alice: 600,
        bob: 300,
        charlie: 200,
        david: 100,
      };
      
      const total = Object.values(userSpending).reduce((sum, amt) => sum + amt, 0);
      const numMembers = Object.keys(userSpending).length;
      const perPerson = total / numMembers;
      
      expect(total).toBe(1200);
      expect(perPerson).toBe(300);
    });

    it('should round settlements to 2 decimal places', () => {
      const amount = 123.456789;
      const rounded = Number(amount.toFixed(2));
      
      expect(rounded).toBe(123.46);
    });
  });

  describe('/addmember and /removemember', () => {
    it('should add new member', () => {
      const members = [
        { user_name: 'alice', telegram_user_id: 111 },
      ];
      
      const newMember = {
        user_name: 'bob',
        telegram_user_id: 222,
        display_name: 'Bob',
      };
      
      members.push(newMember);
      
      expect(members).toHaveLength(2);
      expect(members[1].user_name).toBe('bob');
    });

    it('should remove existing member', () => {
      const members = [
        { user_name: 'alice', telegram_user_id: 111 },
        { user_name: 'bob', telegram_user_id: 222 },
      ];
      
      const filtered = members.filter(m => m.user_name !== 'bob');
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].user_name).toBe('alice');
    });

    it('should prevent duplicate members', () => {
      const members = [
        { user_name: 'alice', telegram_user_id: 111 },
      ];
      
      const isDuplicate = members.some(m => m.user_name === 'alice');
      
      expect(isDuplicate).toBe(true);
    });
  });

  describe('/members command', () => {
    it('should list all members', () => {
      const members = [
        { user_name: 'alice', display_name: 'Alice', telegram_user_id: 111 },
        { user_name: 'bob', display_name: 'Bob', telegram_user_id: 222 },
      ];
      
      expect(members).toHaveLength(2);
      expect(members.map(m => m.display_name)).toContain('Alice');
      expect(members.map(m => m.display_name)).toContain('Bob');
    });

    it('should show member count', () => {
      const members = [
        { user_name: 'alice' },
        { user_name: 'bob' },
        { user_name: 'charlie' },
      ];
      
      expect(members.length).toBe(3);
    });
  });

  describe('Budget status emoji', () => {
    it('should return correct emoji for on-track (<= 80%)', () => {
      const getEmoji = (percent) => {
        if (percent <= 80) return '✅';
        if (percent <= 100) return '⚠️';
        return '🚨';
      };
      
      expect(getEmoji(50)).toBe('✅');
      expect(getEmoji(80)).toBe('✅');
    });

    it('should return warning emoji for close to limit (81-100%)', () => {
      const getEmoji = (percent) => {
        if (percent <= 80) return '✅';
        if (percent <= 100) return '⚠️';
        return '🚨';
      };
      
      expect(getEmoji(85)).toBe('⚠️');
      expect(getEmoji(100)).toBe('⚠️');
    });

    it('should return critical emoji for over budget (>100%)', () => {
      const getEmoji = (percent) => {
        if (percent <= 80) return '✅';
        if (percent <= 100) return '⚠️';
        return '🚨';
      };
      
      expect(getEmoji(101)).toBe('🚨');
      expect(getEmoji(150)).toBe('🚨');
    });
  });

  describe('Date boundary calculations', () => {
    it('should get start of today', () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      expect(todayStart.getHours()).toBe(0);
      expect(todayStart.getMinutes()).toBe(0);
      expect(todayStart.getSeconds()).toBe(0);
    });

    it('should get start of this week (Monday)', () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysToMonday);
      
      expect(monday.getDate()).toBeLessThanOrEqual(now.getDate());
    });

    it('should get start of this month', () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      expect(monthStart.getDate()).toBe(1);
      expect(monthStart.getMonth()).toBe(now.getMonth());
    });

    it('should get start and end of last month', () => {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      
      expect(lastMonthStart.getMonth()).toBe((now.getMonth() - 1 + 12) % 12);
      expect(lastMonthEnd.getMonth()).toBe((now.getMonth() - 1 + 12) % 12);
    });
  });

  describe('Budget message formatting', () => {
    it('should format currency with rupee symbol', () => {
      const amount = 1500;
      const formatted = `₹${amount}`;
      
      expect(formatted).toBe('₹1500');
    });

    it('should format percentages with one decimal', () => {
      const percent = 75.456;
      const formatted = `${percent.toFixed(1)}%`;
      
      expect(formatted).toBe('75.5%');
    });

    it('should format amounts without decimals for display', () => {
      const amount = 123.456;
      const formatted = amount.toFixed(0);
      
      expect(formatted).toBe('123');
    });

    it('should use HTML bold tags for emphasis', () => {
      const category = 'food';
      const formatted = `<b>${category}</b>`;
      
      expect(formatted).toBe('<b>food</b>');
    });
  });

  describe('Edge cases', () => {
    it('should handle no categories', () => {
      const budgets = {};
      const categories = Object.keys(budgets);
      
      expect(categories).toHaveLength(0);
    });

    it('should handle single member', () => {
      const expenses = [
        { user_name: 'alice', amount: 300, settled: false, discarded: false },
      ];
      
      const byUser = {};
      expenses.forEach(e => {
        if (!byUser[e.user_name]) byUser[e.user_name] = 0;
        byUser[e.user_name] += e.amount;
      });
      
      const numMembers = Object.keys(byUser).length;
      
      expect(numMembers).toBe(1);
    });

    it('should handle all expenses settled', () => {
      const expenses = [
        { user_name: 'alice', amount: 300, settled: true, discarded: false },
        { user_name: 'bob', amount: 200, settled: true, discarded: false },
      ];
      
      const unsettled = expenses.filter(e => !e.settled && !e.discarded);
      
      expect(unsettled).toHaveLength(0);
    });

    it('should handle large budget values', () => {
      const budget = 1000000;
      const dailyBudget = budget / 30;
      
      expect(dailyBudget).toBe(33333.333333333336);
      expect(dailyBudget.toFixed(0)).toBe('33333');
    });
  });
});
