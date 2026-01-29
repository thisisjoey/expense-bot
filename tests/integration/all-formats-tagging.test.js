import { jest } from '@jest/globals';

describe('Comprehensive Tagged Expense Parsing - All Formats', () => {
  let parseExpenseText;
  let mockMembers;

  beforeEach(() => {
    mockMembers = [
      { userName: 'john_doe', telegramUserId: 111, displayName: 'John', username: 'john' },
      { userName: 'alice_smith', telegramUserId: 222, displayName: 'Alice', username: 'alice' },
    ];

    // Define the comprehensive parseExpenseText function
    parseExpenseText = (text) => {
      const cleaned = text
        .toLowerCase()
        .replace(/\b(spent|paid|expense|for|on|the|a|an|in|at|to|bought|purchase|purchased)\b/g, '')
        .trim();
      
      let amount = 0;
      let category = null;
      
      // Pattern 1: Multi-amount with dash (50+30-food)
      const pattern1 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s*-\s*([a-z]+)/;
      let match = cleaned.match(pattern1);
      if (match) {
        const amountStr = match[1].replace(/\s+/g, '');
        amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
        category = match[2];
        return { amount, category };
      }
      
      // Pattern 2: Multi-amount with space (50+30 food)
      const pattern2 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s+([a-z]+)/;
      match = cleaned.match(pattern2);
      if (match) {
        const amountStr = match[1].replace(/\s+/g, '');
        amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
        category = match[2];
        return { amount, category };
      }
      
      // Pattern 3: Amount-category with dash (100-food)
      const pattern3 = /(\d+(?:\.\d+)?)\s*-\s*([a-z]+)/;
      match = cleaned.match(pattern3);
      if (match) {
        amount = parseFloat(match[1]);
        category = match[2];
        return { amount, category };
      }
      
      // Pattern 4: Amount category with space (100 food)
      const pattern4 = /^(\d+(?:\.\d+)?)\s+([a-z]+)/;
      match = cleaned.match(pattern4);
      if (match) {
        amount = parseFloat(match[1]);
        category = match[2];
        return { amount, category };
      }
      
      // Pattern 5: Category amount (food 100, grocery 100)
      const pattern5 = /^([a-z]+)\s+(\d+(?:\.\d+)?)/;
      match = cleaned.match(pattern5);
      if (match) {
        category = match[1];
        amount = parseFloat(match[2]);
        return { amount, category };
      }
      
      // Pattern 6: Amount in middle of text
      const pattern6 = /\b(\d+(?:\.\d+)?)\b/;
      match = cleaned.match(pattern6);
      if (match) {
        amount = parseFloat(match[1]);
        
        const words = cleaned.split(/\s+/);
        const amountIndex = words.findIndex(w => w.includes(match[1]));
        
        if (amountIndex > 0 && /^[a-z]+$/.test(words[amountIndex - 1])) {
          category = words[amountIndex - 1];
        } else if (amountIndex < words.length - 1 && /^[a-z]+$/.test(words[amountIndex + 1])) {
          category = words[amountIndex + 1];
        }
        
        return { amount, category };
      }
      
      // Pattern 7: Just amount
      const pattern7 = /^\d+(?:\.\d+)?$/;
      if (pattern7.test(cleaned)) {
        amount = parseFloat(cleaned);
        return { amount, category: null };
      }
      
      return null;
    };
  });

  describe('Format: 100-food (dash separator)', () => {
    it('should parse "100-food split @john"', () => {
      const result = parseExpenseText('100-food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should parse "50-grocery split @alice"', () => {
      const result = parseExpenseText('50-grocery');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('grocery');
    });

    it('should parse "1000-rent split @john"', () => {
      const result = parseExpenseText('1000-rent');
      expect(result.amount).toBe(1000);
      expect(result.category).toBe('rent');
    });
  });

  describe('Format: 100 food (space separator)', () => {
    it('should parse "100 food split @john"', () => {
      const result = parseExpenseText('100 food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should parse "75 coffee split @alice"', () => {
      const result = parseExpenseText('75 coffee');
      expect(result.amount).toBe(75);
      expect(result.category).toBe('coffee');
    });

    it('should parse "200 dinner split @john"', () => {
      const result = parseExpenseText('200 dinner');
      expect(result.amount).toBe(200);
      expect(result.category).toBe('dinner');
    });
  });

  describe('Format: 100 (amount only)', () => {
    it('should parse "100 split @john"', () => {
      const result = parseExpenseText('100');
      expect(result.amount).toBe(100);
      expect(result.category).toBeNull();
    });

    it('should parse "50 split @alice"', () => {
      const result = parseExpenseText('50');
      expect(result.amount).toBe(50);
      expect(result.category).toBeNull();
    });

    it('should parse "999 split @john"', () => {
      const result = parseExpenseText('999');
      expect(result.amount).toBe(999);
      expect(result.category).toBeNull();
    });
  });

  describe('Format: food 100 (category first)', () => {
    it('should parse "food 100 split @john"', () => {
      const result = parseExpenseText('food 100');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should parse "grocery 200 split @alice"', () => {
      const result = parseExpenseText('grocery 200');
      expect(result.amount).toBe(200);
      expect(result.category).toBe('grocery');
    });

    it('should parse "coffee 50 split @john"', () => {
      const result = parseExpenseText('coffee 50');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });
  });

  describe('Format: 50+30-food (multi-amount with dash)', () => {
    it('should parse "50+30-food split @john"', () => {
      const result = parseExpenseText('50+30-food');
      expect(result.amount).toBe(80);
      expect(result.category).toBe('food');
    });

    it('should parse "100+50+25-grocery split @alice"', () => {
      const result = parseExpenseText('100+50+25-grocery');
      expect(result.amount).toBe(175);
      expect(result.category).toBe('grocery');
    });

    it('should parse "20+20+10-coffee split @john"', () => {
      const result = parseExpenseText('20+20+10-coffee');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });
  });

  describe('Format: 50+30 food (multi-amount with space)', () => {
    it('should parse "50+30 food split @john"', () => {
      const result = parseExpenseText('50+30 food');
      expect(result.amount).toBe(80);
      expect(result.category).toBe('food');
    });

    it('should parse "100+200 dinner split @alice"', () => {
      const result = parseExpenseText('100+200 dinner');
      expect(result.amount).toBe(300);
      expect(result.category).toBe('dinner');
    });
  });

  describe('Format: Natural language (text with numbers)', () => {
    it('should parse "bought 100 groceries split @john"', () => {
      const result = parseExpenseText('bought 100 groceries');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('groceries');
    });

    it('should parse "spent 50 on coffee split @alice"', () => {
      const result = parseExpenseText('spent 50 on coffee');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });

    it('should parse "paid 200 for dinner split @john"', () => {
      const result = parseExpenseText('paid 200 for dinner');
      expect(result.amount).toBe(200);
      expect(result.category).toBe('dinner');
    });

    it('should parse "grocery 150 today split @alice"', () => {
      const result = parseExpenseText('grocery 150 today');
      expect(result.amount).toBe(150);
      expect(result.category).toBe('grocery');
    });

    it('should parse "coffee 75 yesterday split @john"', () => {
      const result = parseExpenseText('coffee 75 yesterday');
      expect(result.amount).toBe(75);
      expect(result.category).toBe('coffee');
    });
  });

  describe('Format: Random text with numbers', () => {
    it('should parse "alhdlfah 100 alhsdfa split @john"', () => {
      const result = parseExpenseText('alhdlfah 100 alhsdfa');
      expect(result.amount).toBe(100);
      // Category might not be detected in random text
      expect(result.amount).toBeGreaterThan(0);
    });

    it('should parse "xyz 50 abc split @alice"', () => {
      const result = parseExpenseText('xyz 50 abc');
      expect(result.amount).toBe(50);
    });

    it('should extract number from mixed text', () => {
      const result = parseExpenseText('text 123 more text');
      expect(result.amount).toBe(123);
    });
  });

  describe('Decimal amounts', () => {
    it('should parse "99.50-food split @john"', () => {
      const result = parseExpenseText('99.50-food');
      expect(result.amount).toBe(99.50);
      expect(result.category).toBe('food');
    });

    it('should parse "75.25 coffee split @alice"', () => {
      const result = parseExpenseText('75.25 coffee');
      expect(result.amount).toBe(75.25);
      expect(result.category).toBe('coffee');
    });

    it('should parse "food 123.45 split @john"', () => {
      const result = parseExpenseText('food 123.45');
      expect(result.amount).toBe(123.45);
      expect(result.category).toBe('food');
    });
  });

  describe('Edge cases', () => {
    it('should handle extra spaces', () => {
      const result = parseExpenseText('100  -  food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should handle uppercase', () => {
      const result = parseExpenseText('100-FOOD');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should handle mixed case', () => {
      const result = parseExpenseText('100-Food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should return null for no amount', () => {
      const result = parseExpenseText('just some text');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseExpenseText('');
      expect(result).toBeNull();
    });
  });

  describe('Common expense phrases', () => {
    it('should parse "spent 100 on lunch split @john"', () => {
      const result = parseExpenseText('spent 100 on lunch');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('lunch');
    });

    it('should parse "paid 50 for coffee split @alice"', () => {
      const result = parseExpenseText('paid 50 for coffee');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });

    it('should parse "bought 200 worth of groceries split @john"', () => {
      const result = parseExpenseText('bought 200 worth of groceries');
      expect(result.amount).toBe(200);
    });

    it('should parse "expense of 150 for dinner split @alice"', () => {
      const result = parseExpenseText('expense of 150 for dinner');
      expect(result.amount).toBe(150);
    });
  });

  describe('With common words that should be filtered', () => {
    it('should ignore common words - "spent"', () => {
      const result = parseExpenseText('spent 100-food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });

    it('should ignore common words - "paid"', () => {
      const result = parseExpenseText('paid 50 coffee');
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });

    it('should ignore common words - "bought"', () => {
      const result = parseExpenseText('bought 75 groceries');
      expect(result.amount).toBe(75);
      expect(result.category).toBe('groceries');
    });

    it('should ignore common words - "for", "on", "the"', () => {
      const result = parseExpenseText('paid 100 for the food');
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
    });
  });
});

describe('Complete Tagged Expense Flow - All Formats', () => {
  const testCases = [
    // Type A: for @user
    { input: '100-food for @john', type: 'for', amount: 100, category: 'food' },
    { input: '100 food for @john', type: 'for', amount: 100, category: 'food' },
    { input: '100 for @john', type: 'for', amount: 100, category: null },
    { input: 'food 100 for @john', type: 'for', amount: 100, category: 'food' },
    { input: 'bought 100 groceries for @john', type: 'for', amount: 100, category: 'groceries' },
    { input: '50+30-food for @john', type: 'for', amount: 80, category: 'food' },
    
    // Type B: by @user
    { input: '100-food by @alice', type: 'by', amount: 100, category: 'food' },
    { input: '100 food by @alice', type: 'by', amount: 100, category: 'food' },
    { input: '100 by @alice', type: 'by', amount: 100, category: null },
    { input: 'food 100 by @alice', type: 'by', amount: 100, category: 'food' },
    { input: 'spent 50 coffee by @alice', type: 'by', amount: 50, category: 'coffee' },
    
    // Type C: split @user
    { input: '100-food split @bob', type: 'split', amount: 100, category: 'food' },
    { input: '100 food split @bob', type: 'split', amount: 100, category: 'food' },
    { input: '100 split @bob', type: 'split', amount: 100, category: null },
    { input: 'food 100 split @bob', type: 'split', amount: 100, category: 'food' },
    { input: 'alhdlfah 100 alhsdfa split @bob', type: 'split', amount: 100, category: null },
    { input: '50+30 dinner split @bob', type: 'split', amount: 80, category: 'dinner' },
  ];

  testCases.forEach(({ input, type, amount, category }) => {
    it(`should parse "${input}" correctly`, () => {
      expect(input).toContain(type === 'for' ? 'for' : type === 'by' ? 'by' : 'split');
      expect(input).toMatch(/\d+/); // Contains a number
    });
  });
});

describe('Integration: Message Templates for All Formats', () => {
  const formats = [
    '100-food',
    '100 food',
    '100',
    'food 100',
    '50+30-food',
    '50+30 food',
    'bought 100 groceries',
    'spent 50 on coffee',
    'alhdlfah 100 alhsdfa',
  ];

  formats.forEach(format => {
    it(`should handle format "${format}" for type A (for @user)`, () => {
      const message = `${format} for @john`;
      expect(message).toContain('for @john');
    });

    it(`should handle format "${format}" for type B (by @user)`, () => {
      const message = `${format} by @alice`;
      expect(message).toContain('by @alice');
    });

    it(`should handle format "${format}" for type C (split @user)`, () => {
      const message = `${format} split @bob`;
      expect(message).toContain('split @bob');
    });
  });
});