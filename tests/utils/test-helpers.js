// Test utilities and mocks for expense bot testing

export const mockSupabaseClient = {
  from: jest.fn(),
};

export const createMockSupabaseResponse = (data = [], error = null) => {
  const mockSelect = jest.fn().mockReturnThis();
  const mockOrder = jest.fn().mockReturnThis();
  const mockEq = jest.fn().mockReturnThis();
  const mockInsert = jest.fn().mockReturnThis();
  const mockUpdate = jest.fn().mockReturnThis();
  const mockDelete = jest.fn().mockReturnThis();
  const mockSingle = jest.fn().mockResolvedValue({ data: data[0] || null, error });

  mockSupabaseClient.from.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    order: mockOrder,
    single: mockSingle,
  });

  mockSelect.mockReturnValue({
    order: mockOrder,
    eq: mockEq,
  });

  mockOrder.mockResolvedValue({ data, error });
  mockEq.mockReturnThis();
  mockInsert.mockResolvedValue({ data, error });
  mockUpdate.mockReturnValue({
    eq: mockEq,
  });
  mockDelete.mockReturnValue({
    eq: mockEq,
  });

  return mockSupabaseClient;
};

export const createMockTelegramUpdate = (overrides = {}) => ({
  message: {
    message_id: 123,
    chat: {
      id: -1001234567890,
      type: 'supergroup',
    },
    from: {
      id: 123456,
      username: 'testuser',
      first_name: 'Test',
    },
    text: '/start',
    date: Math.floor(Date.now() / 1000),
    ...overrides.message,
  },
  ...overrides,
});

export const createMockRequest = (body = {}, headers = {}) => ({
  method: 'POST',
  body,
  headers: {
    'content-type': 'application/json',
    ...headers,
  },
});

export const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
};

export const mockFetch = (responses = []) => {
  const mockResponses = responses.map(({ data, ok = true, status = 200 }) => ({
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }));

  let callCount = 0;
  return jest.fn(() => {
    const response = mockResponses[callCount] || mockResponses[mockResponses.length - 1];
    callCount++;
    return Promise.resolve(response);
  });
};

export const createMockExpense = (overrides = {}) => ({
  id: 1,
  user_name: 'testuser',
  amount: 100,
  category: 'food',
  comment: '',
  ts: new Date().toISOString(),
  discarded: false,
  telegram_user_id: 123456,
  telegram_message_id: 123,
  settled: false,
  ...overrides,
});

export const createMockBudget = (overrides = {}) => ({
  category: 'food',
  budget: 5000,
  ...overrides,
});

export const createMockMember = (overrides = {}) => ({
  user_name: 'testuser',
  telegram_user_id: 123456,
  display_name: 'Test User',
  username: 'testuser',
  ...overrides,
});

export const createMockSettlement = (overrides = {}) => ({
  user_name: 'testuser',
  settled: true,
  last_settled_date: new Date().toISOString(),
  telegram_user_id: 123456,
  ...overrides,
});

// Helper to set environment variables for tests
export const setTestEnv = () => {
  process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
  process.env.TELEGRAM_CHAT_ID = '-1001234567890';
  process.env.CRON_SECRET = 'test_cron_secret';
};

// Helper to clear environment variables after tests
export const clearTestEnv = () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.CRON_SECRET;
};

// Date helpers
export const getISTDate = (date = new Date()) => {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
};

export const createDateInIST = (year, month, day, hour = 0, minute = 0) => {
  return new Date(year, month, day, hour, minute);
};

// Validation helpers
export const isValidExpenseFormat = (text) => {
  const patterns = [
    /^\d+$/,                           // Just amount
    /^\d+-\w+$/,                       // amount-category
    /^\d+\s+\w+$/,                     // amount category
    /^\d+\+\d+-\w+$/,                  // multi-amount
    /^\d+-\w+,\w+$/,                   // multi-category
  ];
  return patterns.some(pattern => pattern.test(text));
};

export const parseExpenseAmount = (text) => {
  const match = text.match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
};

export const parseExpenseCategory = (text) => {
  const patterns = [
    /-(\w+)$/,      // amount-category
    /\s+(\w+)$/,    // amount category
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  
  return 'uncategorized';
};
