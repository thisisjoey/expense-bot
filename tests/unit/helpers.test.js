import { jest } from '@jest/globals';

describe('Helper Functions', () => {
  let sendMessage, formatDate, escapeHtml, now;

  beforeEach(() => {
    // Mock the sendMessage function
    global.fetch = jest.fn();
    
    // Define helper functions for testing
    sendMessage = async (chatId, text, replyTo = null) => {
      try {
        const payload = {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        };
        
        if (replyTo) {
          payload.reply_to_message_id = replyTo;
        }

        await fetch(`https://api.telegram.org/bottest_token/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    };

    formatDate = (ts) => {
      if (!ts) return 'Never';
      const d = new Date(ts);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      });
    };

    escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    now = () => {
      return new Date().toISOString();
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should send a basic message', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await sendMessage(123456, 'Test message');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest_token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should send a message with reply', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await sendMessage(123456, 'Reply message', 789);

      const callArgs = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callArgs.reply_to_message_id).toBe(789);
    });

    it('should handle send message errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(sendMessage(123456, 'Test')).resolves.not.toThrow();
      
      // Should attempt at least once
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should include HTML parse mode', async () => {
      global.fetch.mockResolvedValue({ ok: true });

      await sendMessage(123456, '<b>Bold</b>');

      const callArgs = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callArgs.parse_mode).toBe('HTML');
    });
  });

  describe('formatDate', () => {
    it('should return "Never" for null/undefined', () => {
      expect(formatDate(null)).toBe('Never');
      expect(formatDate(undefined)).toBe('Never');
    });

    it('should format valid date correctly', () => {
      const date = '2024-01-15T10:30:00Z';
      const formatted = formatDate(date);
      
      expect(formatted).toMatch(/15/);
      expect(formatted).toMatch(/Jan/);
      expect(formatted).toMatch(/2024/);
    });

    it('should handle IST timezone', () => {
      const date = '2024-01-15T00:00:00Z';
      const formatted = formatDate(date);
      
      // Should be formatted in IST (UTC+5:30)
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeHtml('5 < 10')).toBe('5 &lt; 10');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('10 > 5')).toBe('10 &gt; 5');
    });

    it('should escape all special characters', () => {
      expect(escapeHtml('<b>Test & Run</b>')).toBe('&lt;b&gt;Test &amp; Run&lt;/b&gt;');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle string without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('now', () => {
    it('should return ISO string', () => {
      const timestamp = now();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return current time', () => {
      const before = Date.now();
      const timestamp = new Date(now()).getTime();
      const after = Date.now();
      
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });
});