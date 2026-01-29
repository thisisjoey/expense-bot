import { jest } from '@jest/globals';

describe('Comprehensive Tagged Expense Parsing - All Formats', () => {
  let parseExpenseText;
  let parseTaggedExpense;
  let mockMembers;

  beforeEach(() => {
    mockMembers = [
      { userName: 'john_doe', telegramUserId: 111, displayName: 'John', username: 'john' },
      { userName: 'alice_smith', telegramUserId: 222, displayName: 'Alice', username: 'alice' },
      { userName: 'bob_jones', telegramUserId: 333, displayName: 'Bob', username: 'bob' },
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

    // Define parseTaggedExpense function that mimics the webhook behavior
    parseTaggedExpense = (text, message, members) => {
      // Extract mentions from message entities
      const entities = message.entities || [];
      const mentions = entities
        .filter(e => e.type === 'mention' || e.type === 'text_mention')
        .map(e => {
          if (e.type === 'text_mention') {
            return {
              username: e.user.username || e.user.first_name,
              userId: e.user.id,
              displayName: e.user.first_name,
            };
          } else {
            // Extract @username from text
            const mentionText = text.substring(e.offset, e.offset + e.length);
            const username = mentionText.replace('@', '');
            return { username, userId: null, displayName: username };
          }
        });
      
      if (mentions.length === 0) {
        return null; // No mentions found
      }
      
      const mention = mentions[0]; // Use first mention
      
      // Find the member in database
      const taggedMember = members.find(m => 
        m.username === mention.username || 
        m.telegramUserId === mention.userId ||
        m.displayName === mention.displayName
      );
      
      if (!taggedMember) {
        // Member not found, ignore tagging
        return null;
      }
      
      // Check for expense type keywords
      let expenseType = null;
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes(' for @') || lowerText.includes(' for@')) {
        expenseType = 'for'; // Belongs to tagged person
      } else if (lowerText.includes(' by @') || lowerText.includes(' by@')) {
        expenseType = 'by'; // Belongs to you, paid by tagged person
      } else if (lowerText.includes(' split @') || lowerText.includes(' split@')) {
        expenseType = 'split'; // Split expense
      }
      
      if (!expenseType) {
        return null; // No valid expense type keyword
      }
      
      // Remove the tagging part to get clean expense text
      const cleanText = text
        .replace(/ for @\w+/gi, '')
        .replace(/ by @\w+/gi, '')
        .replace(/ split @\w+/gi, '')
        .trim();
      
      // Parse expense using comprehensive patterns
      const parsed = parseExpenseText(cleanText);
      
      if (!parsed || parsed.amount === 0) {
        return null; // No valid amount found
      }
      
      return {
        amount: parsed.amount,
        category: parsed.category || 'uncategorized',
        taggedUser: taggedMember,
        expenseType,
        comment: cleanText,
      };
    };
  });

  describe('Format: 100-food (dash separator)', () => {
    it('should parse "100-food split @john"', () => {
      const message = {
        text: '100-food split @john',
        entities: [{ type: 'mention', offset: 15, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
      expect(result.taggedUser.username).toBe('john');
    });

    it('should parse "50-grocery split @alice"', () => {
      const message = {
        text: '50-grocery split @alice',
        entities: [{ type: 'mention', offset: 17, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.category).toBe('grocery');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "1000-rent split @john"', () => {
      const message = {
        text: '1000-rent split @john',
        entities: [{ type: 'mention', offset: 16, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(1000);
      expect(result.category).toBe('rent');
      expect(result.expenseType).toBe('split');
    });
  });

  describe('Format: 100 food (space separator)', () => {
    it('should parse "100 food split @john"', () => {
      const message = {
        text: '100 food split @john',
        entities: [{ type: 'mention', offset: 15, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "75 coffee split @alice"', () => {
      const message = {
        text: '75 coffee split @alice',
        entities: [{ type: 'mention', offset: 16, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(75);
      expect(result.category).toBe('coffee');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "200 dinner split @john"', () => {
      const message = {
        text: '200 dinner split @john',
        entities: [{ type: 'mention', offset: 17, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(200);
      expect(result.category).toBe('dinner');
    });
  });

  describe('Format: 100 (amount only)', () => {
    it('should parse "100 split @john"', () => {
      const message = {
        text: '100 split @john',
        entities: [{ type: 'mention', offset: 10, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('uncategorized');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "50 split @alice"', () => {
      const message = {
        text: '50 split @alice',
        entities: [{ type: 'mention', offset: 9, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.category).toBe('uncategorized');
    });

    it('should parse "999 split @john"', () => {
      const message = {
        text: '999 split @john',
        entities: [{ type: 'mention', offset: 10, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(999);
      expect(result.category).toBe('uncategorized');
    });
  });

  describe('Format: food 100 (category first)', () => {
    it('should parse "food 100 split @john"', () => {
      const message = {
        text: 'food 100 split @john',
        entities: [{ type: 'mention', offset: 15, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "grocery 200 split @alice"', () => {
      const message = {
        text: 'grocery 200 split @alice',
        entities: [{ type: 'mention', offset: 18, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(200);
      expect(result.category).toBe('grocery');
    });

    it('should parse "coffee 50 split @john"', () => {
      const message = {
        text: 'coffee 50 split @john',
        entities: [{ type: 'mention', offset: 16, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });
  });

  describe('Format: 50+30-food (multi-amount with dash)', () => {
    it('should parse "50+30-food split @john"', () => {
      const message = {
        text: '50+30-food split @john',
        entities: [{ type: 'mention', offset: 17, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(80);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "100+50+25-grocery split @alice"', () => {
      const message = {
        text: '100+50+25-grocery split @alice',
        entities: [{ type: 'mention', offset: 24, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(175);
      expect(result.category).toBe('grocery');
    });

    it('should parse "20+20+10-coffee split @john"', () => {
      const message = {
        text: '20+20+10-coffee split @john',
        entities: [{ type: 'mention', offset: 22, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });
  });

  describe('Format: 50+30 food (multi-amount with space)', () => {
    it('should parse "50+30 food split @john"', () => {
      const message = {
        text: '50+30 food split @john',
        entities: [{ type: 'mention', offset: 17, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(80);
      expect(result.category).toBe('food');
    });

    it('should parse "100+200 dinner split @alice"', () => {
      const message = {
        text: '100+200 dinner split @alice',
        entities: [{ type: 'mention', offset: 21, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(300);
      expect(result.category).toBe('dinner');
    });
  });

  describe('Format: Natural language (text with numbers)', () => {
    it('should parse "bought 100 groceries split @john"', () => {
      const message = {
        text: 'bought 100 groceries split @john',
        entities: [{ type: 'mention', offset: 27, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('groceries');
    });

    it('should parse "spent 50 on coffee split @alice"', () => {
      const message = {
        text: 'spent 50 on coffee split @alice',
        entities: [{ type: 'mention', offset: 25, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.category).toBe('coffee');
    });

    it('should parse "paid 200 for dinner split @john"', () => {
      const message = {
        text: 'paid 200 for dinner split @john',
        entities: [{ type: 'mention', offset: 26, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(200);
      expect(result.category).toBe('dinner');
    });
  });

  describe('Type A: for @user', () => {
    it('should parse "100-food for @john"', () => {
      const message = {
        text: '100-food for @john',
        entities: [{ type: 'mention', offset: 13, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('for');
      expect(result.taggedUser.username).toBe('john');
    });

    it('should parse "100 food for @john"', () => {
      const message = {
        text: '100 food for @john',
        entities: [{ type: 'mention', offset: 13, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('for');
    });

    it('should parse "100 for @john" (no category)', () => {
      const message = {
        text: '100 for @john',
        entities: [{ type: 'mention', offset: 8, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('uncategorized');
      expect(result.expenseType).toBe('for');
    });

    it('should parse "food 100 for @john"', () => {
      const message = {
        text: 'food 100 for @john',
        entities: [{ type: 'mention', offset: 13, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('for');
    });

    it('should parse "50+30-food for @john"', () => {
      const message = {
        text: '50+30-food for @john',
        entities: [{ type: 'mention', offset: 15, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(80);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('for');
    });
  });

  describe('Type B: by @user', () => {
    it('should parse "100-food by @alice"', () => {
      const message = {
        text: '100-food by @alice',
        entities: [{ type: 'mention', offset: 12, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('by');
      expect(result.taggedUser.username).toBe('alice');
    });

    it('should parse "100 food by @alice"', () => {
      const message = {
        text: '100 food by @alice',
        entities: [{ type: 'mention', offset: 12, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('by');
    });

    it('should parse "100 by @alice" (no category)', () => {
      const message = {
        text: '100 by @alice',
        entities: [{ type: 'mention', offset: 7, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('uncategorized');
      expect(result.expenseType).toBe('by');
    });

    it('should parse "food 100 by @alice"', () => {
      const message = {
        text: 'food 100 by @alice',
        entities: [{ type: 'mention', offset: 12, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('by');
    });
  });

  describe('Type C: split @user', () => {
    it('should parse "100-food split @bob"', () => {
      const message = {
        text: '100-food split @bob',
        entities: [{ type: 'mention', offset: 15, length: 4 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
      expect(result.taggedUser.username).toBe('bob');
    });

    it('should parse "100 food split @bob"', () => {
      const message = {
        text: '100 food split @bob',
        entities: [{ type: 'mention', offset: 15, length: 4 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
    });

    it('should parse "100 split @bob" (no category)', () => {
      const message = {
        text: '100 split @bob',
        entities: [{ type: 'mention', offset: 10, length: 4 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      expect(result.category).toBe('uncategorized');
      expect(result.expenseType).toBe('split');
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should return null when no mention entity provided', () => {
      const message = {
        text: '100-food split @john',
        entities: [] // No entities
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).toBeNull();
    });

    it('should return null when mentioned user not in members', () => {
      const message = {
        text: '100-food split @unknown',
        entities: [{ type: 'mention', offset: 15, length: 8 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).toBeNull();
    });

    it('should return null when no expense type keyword', () => {
      const message = {
        text: '100-food @john', // Missing 'for', 'by', or 'split'
        entities: [{ type: 'mention', offset: 9, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).toBeNull();
    });

    it('should return null when no amount in text', () => {
      const message = {
        text: 'food split @john', // No amount
        entities: [{ type: 'mention', offset: 11, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).toBeNull();
    });

    it('should handle decimal amounts', () => {
      const message = {
        text: '99.50-food split @john',
        entities: [{ type: 'mention', offset: 17, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(99.50);
      expect(result.category).toBe('food');
    });
  });

  describe('Decimal amounts with all tag types', () => {
    it('should parse "99.50-food for @john"', () => {
      const message = {
        text: '99.50-food for @john',
        entities: [{ type: 'mention', offset: 15, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(99.50);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('for');
    });

    it('should parse "75.25 coffee by @alice"', () => {
      const message = {
        text: '75.25 coffee by @alice',
        entities: [{ type: 'mention', offset: 16, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(75.25);
      expect(result.category).toBe('coffee');
      expect(result.expenseType).toBe('by');
    });

    it('should parse "food 123.45 split @john"', () => {
      const message = {
        text: 'food 123.45 split @john',
        entities: [{ type: 'mention', offset: 18, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(123.45);
      expect(result.category).toBe('food');
      expect(result.expenseType).toBe('split');
    });
  });

  describe('Random text with numbers', () => {
    it('should parse "alhdlfah 100 alhsdfa split @john"', () => {
      const message = {
        text: 'alhdlfah 100 alhsdfa split @john',
        entities: [{ type: 'mention', offset: 27, length: 5 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(100);
      // Random words might be picked as category
      expect(result.expenseType).toBe('split');
    });

    it('should parse "xyz 50 abc by @alice"', () => {
      const message = {
        text: 'xyz 50 abc by @alice',
        entities: [{ type: 'mention', offset: 14, length: 6 }]
      };
      const result = parseTaggedExpense(message.text, message, mockMembers);
      expect(result).not.toBeNull();
      expect(result.amount).toBe(50);
      expect(result.expenseType).toBe('by');
    });
  });
});

describe('parseExpenseText - Standalone Tests', () => {
  let parseExpenseText;

  beforeEach(() => {
    parseExpenseText = (text) => {
      const cleaned = text
        .toLowerCase()
        .replace(/\b(spent|paid|expense|for|on|the|a|an|in|at|to|bought|purchase|purchased)\b/g, '')
        .trim();
      
      let amount = 0;
      let category = null;
      
      const pattern1 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s*-\s*([a-z]+)/;
      let match = cleaned.match(pattern1);
      if (match) {
        const amountStr = match[1].replace(/\s+/g, '');
        amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
        category = match[2];
        return { amount, category };
      }
      
      const pattern2 = /(\d+(?:\.\d+)?(?:\s*[+]\s*\d+(?:\.\d+)?)+)\s+([a-z]+)/;
      match = cleaned.match(pattern2);
      if (match) {
        const amountStr = match[1].replace(/\s+/g, '');
        amount = amountStr.split('+').reduce((sum, num) => sum + parseFloat(num), 0);
        category = match[2];
        return { amount, category };
      }
      
      const pattern3 = /(\d+(?:\.\d+)?)\s*-\s*([a-z]+)/;
      match = cleaned.match(pattern3);
      if (match) {
        amount = parseFloat(match[1]);
        category = match[2];
        return { amount, category };
      }
      
      const pattern4 = /^(\d+(?:\.\d+)?)\s+([a-z]+)/;
      match = cleaned.match(pattern4);
      if (match) {
        amount = parseFloat(match[1]);
        category = match[2];
        return { amount, category };
      }
      
      const pattern5 = /^([a-z]+)\s+(\d+(?:\.\d+)?)/;
      match = cleaned.match(pattern5);
      if (match) {
        category = match[1];
        amount = parseFloat(match[2]);
        return { amount, category };
      }
      
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
      
      const pattern7 = /^\d+(?:\.\d+)?$/;
      if (pattern7.test(cleaned)) {
        amount = parseFloat(cleaned);
        return { amount, category: null };
      }
      
      return null;
    };
  });

  it('should parse "100-food"', () => {
    const result = parseExpenseText('100-food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('food');
  });

  it('should parse "100 food"', () => {
    const result = parseExpenseText('100 food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('food');
  });

  it('should parse "100" (amount only)', () => {
    const result = parseExpenseText('100');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBeNull();
  });

  it('should parse "food 100"', () => {
    const result = parseExpenseText('food 100');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('food');
  });

  it('should parse "50+30-food"', () => {
    const result = parseExpenseText('50+30-food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(80);
    expect(result.category).toBe('food');
  });

  it('should parse "50+30 food"', () => {
    const result = parseExpenseText('50+30 food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(80);
    expect(result.category).toBe('food');
  });

  it('should parse "bought 100 groceries"', () => {
    const result = parseExpenseText('bought 100 groceries');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('groceries');
  });

  it('should parse "spent 50 on coffee"', () => {
    const result = parseExpenseText('spent 50 on coffee');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(50);
    expect(result.category).toBe('coffee');
  });

  it('should return null for text without numbers', () => {
    const result = parseExpenseText('just some text');
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = parseExpenseText('');
    expect(result).toBeNull();
  });

  it('should handle decimal amounts', () => {
    const result = parseExpenseText('99.50-food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(99.50);
    expect(result.category).toBe('food');
  });

  it('should handle uppercase', () => {
    const result = parseExpenseText('100-FOOD');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('food');
  });

  it('should handle mixed case', () => {
    const result = parseExpenseText('100-Food');
    expect(result).not.toBeNull();
    expect(result.amount).toBe(100);
    expect(result.category).toBe('food');
  });
});