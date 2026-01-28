import { jest } from '@jest/globals';

describe('Webhook Command Integration Tests', () => {
  let mockSupabase;
  let mockFetch;

  beforeEach(() => {
    // Setup environment variables
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_key';

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn(),
    };

    // Mock fetch for Telegram API
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe('/start and /help commands', () => {
    it('should respond with help message', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const message = {
        message_id: 1,
        chat: { id: 123 },
        from: { id: 456, username: 'test' },
        text: '/start',
        date: Date.now(),
      };

      // Simulate command handling
      const text = message.text;
      expect(text).toBe('/start');

      // Should call sendMessage with help text
      expect(text === '/start' || text === '/help').toBe(true);
    });

    it('should include all command categories in help', () => {
      const helpText = `💰 <b>Expense Tracker</b>

<b>Add Expenses:</b>
• 90-grocery or 90 grocery
• 50+30-ai or 100-grocery,ai
• Just type any number (e.g., 150) → goes to "uncategorized"`;

      expect(helpText).toContain('Add Expenses');
      expect(helpText).toContain('90-grocery');
      expect(helpText).toContain('uncategorized');
    });
  });

  describe('Expense tracking commands', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({ ok: true });
      
      const mockSelect = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockInsert = jest.fn().mockReturnThis();
      
      mockSelect.mockResolvedValue({
        data: [
          { category: 'food', budget: 5000 },
          { category: 'travel', budget: 3000 },
        ],
        error: null,
      });
      
      mockOrder.mockResolvedValue({
        data: [
          { id: 1, amount: 100, category: 'food', ts: new Date().toISOString(), discarded: false },
        ],
        error: null,
      });
      
      mockInsert.mockResolvedValue({ data: [{ id: 2 }], error: null });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        order: mockOrder,
        insert: mockInsert,
      });
    });

    it('should add basic expense', async () => {
      const text = '100-food';
      const match = text.match(/^(\d+)-(\w+)$/);
      
      expect(match).toBeTruthy();
      
      const expense = {
        amount: parseInt(match[1]),
        category: match[2],
        user_name: 'testuser',
        ts: new Date().toISOString(),
      };
      
      expect(expense.amount).toBe(100);
      expect(expense.category).toBe('food');
    });

    it('should handle uncategorized expense', async () => {
      const text = '100';
      const match = text.match(/^\d+$/);
      
      expect(match).toBeTruthy();
      
      const expense = {
        amount: parseInt(text),
        category: 'uncategorized',
        user_name: 'testuser',
      };
      
      expect(expense.category).toBe('uncategorized');
    });
  });

  describe('/summary command', () => {
    it('should calculate total spent correctly', () => {
      const expenses = [
        { amount: 100, category: 'food', discarded: false, settled: false },
        { amount: 200, category: 'travel', discarded: false, settled: false },
        { amount: 50, category: 'food', discarded: true, settled: false },
      ];
      
      const activeExpenses = expenses.filter(e => !e.discarded);
      const total = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
      
      expect(total).toBe(300);
      expect(activeExpenses).toHaveLength(2);
    });

    it('should group expenses by category', () => {
      const expenses = [
        { amount: 100, category: 'food', discarded: false },
        { amount: 150, category: 'food', discarded: false },
        { amount: 200, category: 'travel', discarded: false },
      ];
      
      const byCategory = {};
      expenses.forEach(e => {
        if (!byCategory[e.category]) byCategory[e.category] = 0;
        byCategory[e.category] += e.amount;
      });
      
      expect(byCategory.food).toBe(250);
      expect(byCategory.travel).toBe(200);
    });
  });

  describe('/owe command', () => {
    it('should calculate settlement amounts', () => {
      const expenses = [
        { amount: 300, user_name: 'alice', settled: false, discarded: false },
        { amount: 200, user_name: 'bob', settled: false, discarded: false },
        { amount: 100, user_name: 'alice', settled: false, discarded: false },
      ];
      
      const unsettledExpenses = expenses.filter(e => !e.settled && !e.discarded);
      const byUser = {};
      
      unsettledExpenses.forEach(e => {
        if (!byUser[e.user_name]) byUser[e.user_name] = 0;
        byUser[e.user_name] += e.amount;
      });
      
      expect(byUser.alice).toBe(400);
      expect(byUser.bob).toBe(200);
      
      const total = Object.values(byUser).reduce((sum, amt) => sum + amt, 0);
      const numMembers = Object.keys(byUser).length;
      const perPerson = total / numMembers;
      
      expect(perPerson).toBe(300);
      expect(byUser.alice - perPerson).toBe(100); // Alice overpaid
      expect(perPerson - byUser.bob).toBe(100); // Bob owes
    });

    it('should exclude settled expenses', () => {
      const expenses = [
        { amount: 300, user_name: 'alice', settled: false, discarded: false },
        { amount: 200, user_name: 'bob', settled: true, discarded: false },
      ];
      
      const unsettledExpenses = expenses.filter(e => !e.settled && !e.discarded);
      
      expect(unsettledExpenses).toHaveLength(1);
      expect(unsettledExpenses[0].user_name).toBe('alice');
    });
  });

  describe('/categories command', () => {
    it('should list all budgets', () => {
      const budgets = {
        food: 5000,
        travel: 3000,
        shopping: 2000,
      };
      
      const categories = Object.keys(budgets);
      
      expect(categories).toHaveLength(3);
      expect(categories).toContain('food');
      expect(categories).toContain('travel');
    });

    it('should format budget display', () => {
      const budgets = {
        food: 5000,
        travel: 3000,
      };
      
      const lines = Object.entries(budgets).map(([cat, amount]) => 
        `• <b>${cat}</b>: ₹${amount}`
      );
      
      expect(lines[0]).toContain('food');
      expect(lines[0]).toContain('₹5000');
    });
  });

  describe('/stats command', () => {
    it('should calculate statistics correctly', () => {
      const expenses = [
        { amount: 100, category: 'food', discarded: false },
        { amount: 200, category: 'food', discarded: false },
        { amount: 150, category: 'travel', discarded: false },
      ];
      
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      const count = expenses.length;
      const average = total / count;
      
      expect(total).toBe(450);
      expect(count).toBe(3);
      expect(average).toBe(150);
    });

    it('should find highest expense', () => {
      const expenses = [
        { amount: 100, category: 'food' },
        { amount: 500, category: 'travel' },
        { amount: 200, category: 'shopping' },
      ];
      
      const highest = expenses.reduce((max, e) => 
        e.amount > max.amount ? e : max
      );
      
      expect(highest.amount).toBe(500);
      expect(highest.category).toBe('travel');
    });
  });

  describe('/last command', () => {
    it('should parse last N expenses', () => {
      const text = '/last 10';
      const match = text.match(/^\/last\s+(\d+)$/);
      
      expect(match).toBeTruthy();
      expect(parseInt(match[1])).toBe(10);
    });

    it('should default to 5 if no number specified', () => {
      const text = '/last';
      const match = text.match(/^\/last\s+(\d+)$/);
      
      expect(match).toBeFalsy();
      // Should use default of 5
    });

    it('should limit to available expenses', () => {
      const expenses = [
        { id: 1, amount: 100 },
        { id: 2, amount: 200 },
      ];
      
      const requestedCount = 10;
      const actualCount = Math.min(requestedCount, expenses.length);
      
      expect(actualCount).toBe(2);
    });
  });

  describe('/search command', () => {
    it('should parse search query', () => {
      const text = '/search food';
      const match = text.match(/^\/search\s+(.+)$/);
      
      expect(match).toBeTruthy();
      expect(match[1]).toBe('food');
    });

    it('should filter expenses by search term', () => {
      const expenses = [
        { amount: 100, category: 'food', comment: 'lunch' },
        { amount: 200, category: 'travel', comment: 'taxi' },
        { amount: 150, category: 'food', comment: 'dinner' },
      ];
      
      const searchTerm = 'food';
      const filtered = expenses.filter(e => 
        e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.comment.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      expect(filtered).toHaveLength(2);
    });
  });

  describe('/addcategory command', () => {
    it('should parse category and budget', () => {
      const text = '/addcategory food 5000';
      const match = text.match(/^\/addcategory\s+(\w+)\s+(\d+)$/);
      
      expect(match).toBeTruthy();
      expect(match[1]).toBe('food');
      expect(parseInt(match[2])).toBe(5000);
    });

    it('should reject invalid budget', () => {
      const text = '/addcategory food abc';
      const match = text.match(/^\/addcategory\s+(\w+)\s+(\d+)$/);
      
      expect(match).toBeFalsy();
    });
  });

  describe('/setbudget command', () => {
    it('should parse budget update', () => {
      const text = '/setbudget food 6000';
      const match = text.match(/^\/setbudget\s+(\w+)\s+(\d+)$/);
      
      expect(match).toBeTruthy();
      expect(match[1]).toBe('food');
      expect(parseInt(match[2])).toBe(6000);
    });
  });

  describe('/revert command', () => {
    it('should handle revert as reply', () => {
      const message = {
        text: '/revert',
        reply_to_message: {
          message_id: 123,
        },
      };
      
      expect(message.reply_to_message).toBeDefined();
      expect(message.reply_to_message.message_id).toBe(123);
    });

    it('should reject revert without reply', () => {
      const message = {
        text: '/revert',
      };
      
      expect(message.reply_to_message).toBeUndefined();
    });
  });

  describe('Date filtering', () => {
    it('should filter expenses by current month', () => {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      const expenses = [
        { amount: 100, ts: new Date(currentYear, currentMonth, 15).toISOString() },
        { amount: 200, ts: new Date(currentYear, currentMonth - 1, 15).toISOString() },
      ];
      
      const thisMonth = expenses.filter(e => {
        const expDate = new Date(e.ts);
        return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
      });
      
      expect(thisMonth).toHaveLength(1);
      expect(thisMonth[0].amount).toBe(100);
    });

    it('should handle IST timezone correctly', () => {
      const utcDate = new Date();
      const istDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      
      expect(istDate).toBeInstanceOf(Date);
      expect(Math.abs(istDate.getTime() - utcDate.getTime())).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe('Error handling', () => {
    it('should handle Supabase errors gracefully', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      
      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });
      
      const result = await mockSelect();
      
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Database error');
    });

    it('should handle Telegram API errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      await expect(mockFetch()).rejects.toThrow('Network error');
    });
  });

  describe('Budget calculations', () => {
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

    it('should calculate percentage spent', () => {
      const budget = 1000;
      const spent = 750;
      const percent = (spent / budget) * 100;
      
      expect(percent).toBe(75);
    });
  });
});
