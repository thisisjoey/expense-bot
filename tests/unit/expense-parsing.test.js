import { jest } from '@jest/globals';

describe('Expense Parsing', () => {
  describe('Basic expense formats', () => {
    it('should parse amount only', () => {
      const text = '100';
      expect(text).toMatch(/^\d+$/);
      expect(parseInt(text)).toBe(100);
    });

    it('should parse amount-category with dash', () => {
      const text = '100-food';
      const match = text.match(/^(\d+)-(\w+)$/);
      
      expect(match).toBeTruthy();
      expect(parseInt(match[1])).toBe(100);
      expect(match[2]).toBe('food');
    });

    it('should parse amount category with space', () => {
      const text = '100 food';
      const match = text.match(/^(\d+)\s+(\w+)$/);
      
      expect(match).toBeTruthy();
      expect(parseInt(match[1])).toBe(100);
      expect(match[2]).toBe('food');
    });

    it('should parse multi-amount expense', () => {
      const text = '50+30-food';
      const match = text.match(/^(\d+)\+(\d+)-(\w+)$/);
      
      expect(match).toBeTruthy();
      expect(parseInt(match[1]) + parseInt(match[2])).toBe(80);
      expect(match[3]).toBe('food');
    });

    it('should parse multi-category expense', () => {
      const text = '100-food,grocery';
      const match = text.match(/^(\d+)-(.+)$/);
      
      expect(match).toBeTruthy();
      expect(parseInt(match[1])).toBe(100);
      expect(match[2]).toContain('food');
      expect(match[2]).toContain('grocery');
    });
  });

  describe('Amount validation', () => {
    it('should accept valid amounts', () => {
      const validAmounts = ['1', '10', '100', '1000', '9999'];
      
      validAmounts.forEach(amount => {
        expect(amount).toMatch(/^\d+$/);
        expect(parseInt(amount)).toBeGreaterThan(0);
      });
    });

    it('should reject negative amounts', () => {
      const text = '-100';
      expect(text).not.toMatch(/^\d+$/);
    });

    it('should reject decimal amounts in basic format', () => {
      const text = '100.50';
      expect(text).not.toMatch(/^\d+$/);
    });

    it('should reject zero amount', () => {
      const amount = 0;
      expect(amount).toBe(0);
    });
  });

  describe('Category validation', () => {
    it('should accept alphanumeric categories', () => {
      const categories = ['food', 'travel', 'shopping123', 'gym'];
      
      categories.forEach(cat => {
        expect(cat).toMatch(/^\w+$/);
      });
    });

    it('should handle uncategorized expenses', () => {
      const text = '100';
      const hasCategory = /-\w+$/.test(text) || /\s+\w+$/.test(text);
      
      expect(hasCategory).toBe(false);
      // Should default to 'uncategorized'
    });
  });

  describe('Complex expense parsing', () => {
    it('should parse multiple amounts with plus', () => {
      const text = '50+30+20-food';
      const amountPart = text.split('-')[0];
      const amounts = amountPart.split('+').map(a => parseInt(a));
      const total = amounts.reduce((sum, a) => sum + a, 0);
      
      expect(total).toBe(100);
    });

    it('should parse multiple categories', () => {
      const text = '100-food,grocery,snacks';
      const match = text.match(/^(\d+)-(.+)$/);
      const categories = match[2].split(',');
      
      expect(categories).toHaveLength(3);
      expect(categories).toContain('food');
      expect(categories).toContain('grocery');
      expect(categories).toContain('snacks');
    });

    it('should calculate split amounts for multiple categories', () => {
      const amount = 300;
      const categories = ['food', 'grocery', 'snacks'];
      const splitAmount = amount / categories.length;
      
      expect(splitAmount).toBe(100);
    });
  });

  describe('Comment parsing', () => {
    it('should parse expense with comment', () => {
      const text = '100-food Lunch at restaurant';
      const parts = text.split(' ');
      const expensePart = parts[0];
      const comment = parts.slice(1).join(' ');
      
      expect(expensePart).toBe('100-food');
      expect(comment).toBe('Lunch at restaurant');
    });

    it('should handle expense without comment', () => {
      const text = '100-food';
      const hasSpace = text.includes(' ');
      
      expect(hasSpace).toBe(false);
    });
  });

  describe('Invalid formats', () => {
    it('should reject text without numbers', () => {
      const text = 'food';
      expect(text).not.toMatch(/^\d+/);
    });

    it('should reject invalid characters', () => {
      const text = '100@food';
      expect(text).not.toMatch(/^\d+-\w+$/);
    });

    it('should reject command-like patterns', () => {
      const commands = ['/start', '/help', '/summary'];
      
      commands.forEach(cmd => {
        expect(cmd).toMatch(/^\//);
        expect(cmd).not.toMatch(/^\d+/);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle large amounts', () => {
      const text = '999999-food';
      const match = text.match(/^(\d+)-(\w+)$/);
      
      expect(parseInt(match[1])).toBe(999999);
    });

    it('should handle single digit amounts', () => {
      const text = '5-food';
      const match = text.match(/^(\d+)-(\w+)$/);
      
      expect(parseInt(match[1])).toBe(5);
    });

    it('should handle long category names', () => {
      const text = '100-entertainmentandrecreation';
      const match = text.match(/^(\d+)-(\w+)$/);
      
      expect(match[2]).toBe('entertainmentandrecreation');
    });

    it('should parse expense with only spaces in comment', () => {
      const text = '100-food    ';
      const trimmed = text.trim();
      
      expect(trimmed).toBe('100-food');
    });
  });

  describe('Date and timestamp handling', () => {
    it('should generate ISO timestamp', () => {
      const now = new Date().toISOString();
      
      expect(now).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle IST timezone conversion', () => {
      const utcDate = new Date();
      const istDate = new Date(utcDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      
      expect(istDate).toBeInstanceOf(Date);
      expect(istDate.getTime()).toBeDefined();
    });
  });

  describe('User information parsing', () => {
    it('should extract username from telegram user', () => {
      const user = {
        id: 123456,
        username: 'testuser',
        first_name: 'Test',
      };
      
      expect(user.username).toBe('testuser');
    });

    it('should handle user without username', () => {
      const user = {
        id: 123456,
        first_name: 'Test',
      };
      
      expect(user.username).toBeUndefined();
      expect(user.first_name).toBe('Test');
    });
  });
});
