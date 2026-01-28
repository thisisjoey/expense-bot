# Expense Bot - Automated Testing Suite

## 📋 Table of Contents

1. [Overview](#overview)
2. [Test Architecture](#test-architecture)
3. [Running Tests](#running-tests)
4. [Test Coverage](#test-coverage)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Test Reports](#test-reports)
7. [Writing Tests](#writing-tests)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This comprehensive automated testing suite ensures the Expense Bot functions correctly across all features. The test suite includes:

- **Unit Tests**: Test individual functions and utilities
- **Integration Tests**: Test API endpoints and command handling
- **Coverage Reporting**: Detailed code coverage analysis
- **Automated CI/CD**: Tests run automatically on every push
- **Detailed Reports**: HTML and Markdown reports for analysis

### Test Statistics

- **Total Test Suites**: 5+
- **Total Tests**: 100+
- **Coverage Target**: 70%+
- **Supported Node Versions**: 18.x, 20.x

---

## Test Architecture

### Directory Structure

\`\`\`
expense-bot-main/
├── api/
│   ├── webhook.js              # Main webhook handler
│   └── cron/
│       └── daily-summary.js    # Cron job handler
├── tests/
│   ├── unit/
│   │   ├── helpers.test.js            # Helper function tests
│   │   ├── alerts.test.js             # Alert generation tests
│   │   └── expense-parsing.test.js    # Expense parsing tests
│   ├── integration/
│   │   ├── webhook.test.js            # Webhook command tests
│   │   └── cron.test.js               # Cron job tests
│   └── utils/
│       └── test-helpers.js            # Test utilities and mocks
├── scripts/
│   └── generate-report.js      # Report generation script
├── .github/
│   └── workflows/
│       └── test.yml           # CI/CD workflow
├── coverage/                  # Coverage reports (generated)
├── test-report.html          # HTML test report (generated)
├── TEST_REPORT.md            # Markdown test report (generated)
└── jest.config.js            # Jest configuration
\`\`\`

### Test Categories

#### 1. Unit Tests

**Helper Functions** (\`tests/unit/helpers.test.js\`)
- \`sendMessage\`: Telegram message sending
- \`formatDate\`: Date formatting with IST timezone
- \`escapeHtml\`: HTML entity escaping
- \`now\`: ISO timestamp generation

**Alert Generation** (\`tests/unit/alerts.test.js\`)
- Budget threshold detection (critical, warning, watch, healthy)
- Timeframe calculations (daily, weekly, monthly)
- Expense filtering and categorization
- Message formatting

**Expense Parsing** (\`tests/unit/expense-parsing.test.js\`)
- Amount validation
- Category extraction
- Multi-amount parsing
- Comment handling
- Invalid format detection

#### 2. Integration Tests

**Webhook Commands** (\`tests/integration/webhook.test.js\`)
- Command handling (/start, /help, /summary, etc.)
- Expense tracking workflows
- Budget management
- Settlement calculations
- Statistics generation

**Cron Jobs** (\`tests/integration/cron.test.js\`)
- Daily summary generation
- Budget calculations
- Date filtering (IST timezone)
- Status determination

---

## Running Tests

### Prerequisites

\`\`\`bash
# Install dependencies
npm install
\`\`\`

### Basic Commands

\`\`\`bash
# Run all tests
npm test

# Run tests with coverage
npm run test:ci

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in watch mode (for development)
npm run test:watch

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix
\`\`\`

### Running Specific Tests

\`\`\`bash
# Run a specific test file
npm test tests/unit/helpers.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="sendMessage"

# Run tests for a specific suite
npm test -- --testNamePattern="Helper Functions"
\`\`\`

### Environment Variables

For local testing, set these environment variables:

\`\`\`bash
export TELEGRAM_BOT_TOKEN="your_test_token"
export SUPABASE_URL="https://test.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_test_key"
export TELEGRAM_CHAT_ID="-1001234567890"
export CRON_SECRET="your_test_secret"
\`\`\`

Or create a \`.env.test\` file (not committed to git):

\`\`\`env
TELEGRAM_BOT_TOKEN=your_test_token
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_test_key
TELEGRAM_CHAT_ID=-1001234567890
CRON_SECRET=your_test_secret
\`\`\`

---

## Test Coverage

### Coverage Thresholds

The project maintains the following coverage thresholds:

- **Lines**: ≥ 70%
- **Statements**: ≥ 70%
- **Functions**: ≥ 70%
- **Branches**: ≥ 70%

### Viewing Coverage Reports

After running tests with coverage:

\`\`\`bash
# Generate coverage report
npm run test:ci

# Open HTML report in browser
open coverage/index.html   # macOS
xdg-open coverage/index.html   # Linux
start coverage/index.html  # Windows
\`\`\`

### Coverage Report Files

- **HTML**: \`coverage/index.html\` - Interactive HTML report
- **LCOV**: \`coverage/lcov.info\` - LCOV format for CI tools
- **JSON**: \`coverage/coverage-summary.json\` - JSON summary

---

## CI/CD Pipeline

### GitHub Actions Workflow

Tests run automatically on:

1. **Push** to \`main\` or \`develop\` branches
2. **Pull Requests** to \`main\` or \`develop\` branches
3. **Manual Workflow Dispatch**

### Workflow Steps

1. **Checkout Code**: Clone repository
2. **Setup Node.js**: Install Node.js (versions 18.x and 20.x)
3. **Install Dependencies**: Run \`npm ci\`
4. **Lint Code**: Run ESLint
5. **Run Unit Tests**: Execute unit test suite
6. **Run Integration Tests**: Execute integration test suite
7. **Generate Coverage**: Create coverage reports
8. **Upload Artifacts**: Store test results and coverage
9. **Check Thresholds**: Verify coverage meets requirements
10. **Comment PR**: Add test results to pull request (if applicable)
11. **Send Notifications**: Notify on success/failure

### Artifacts

After each test run, the following artifacts are available for download:

- **Coverage Report**: Complete coverage analysis
- **Test Results**: HTML and XML test reports
- **Failure Logs**: Detailed logs if tests fail (7-day retention)

Artifacts are retained for **30 days** (7 days for failure logs).

### Viewing CI/CD Results

1. Go to **Actions** tab in GitHub repository
2. Click on latest workflow run
3. View test results in the summary
4. Download artifacts for detailed analysis

---

## Test Reports

### Automated Report Generation

Reports are automatically generated after each test run:

1. **HTML Test Report** (\`test-report.html\`)
   - Visual test results
   - Failed test details
   - Execution times

2. **Markdown Report** (\`TEST_REPORT.md\`)
   - Coverage summary
   - Test categories
   - Known issues
   - Recommendations

3. **JSON Summary** (\`test-summary.json\`)
   - Machine-readable results
   - Coverage data
   - Test counts

### Generating Reports Manually

\`\`\`bash
# Run tests and generate report
npm run test:ci

# Generate markdown report
node scripts/generate-report.js
\`\`\`

### Report Contents

Each report includes:

- **Coverage Summary**: Lines, statements, functions, branches
- **File-Level Coverage**: Individual file statistics
- **Test Results**: Pass/fail status for each test
- **Failed Tests**: Detailed error messages
- **Recommendations**: Actions to improve test quality

---

## Writing Tests

### Test Structure

\`\`\`javascript
import { jest } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup code runs before each test
  });

  afterEach(() => {
    // Cleanup code runs after each test
  });

  describe('Sub-feature', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
\`\`\`

### Best Practices

1. **Test Naming**: Use descriptive names
   - ✅ "should calculate total amount correctly"
   - ❌ "test1"

2. **AAA Pattern**: Arrange, Act, Assert
   \`\`\`javascript
   // Arrange: Set up test data
   const budgets = { food: 1000 };

   // Act: Execute the function
   const result = calculateTotal(budgets);

   // Assert: Verify the result
   expect(result).toBe(1000);
   \`\`\`

3. **One Assertion Per Test**: Focus on single behavior
   \`\`\`javascript
   // Good
   it('should return correct amount', () => {
     expect(parseAmount('100')).toBe(100);
   });

   it('should return correct category', () => {
     expect(parseCategory('100-food')).toBe('food');
   });
   \`\`\`

4. **Mock External Dependencies**
   \`\`\`javascript
   global.fetch = jest.fn().mockResolvedValue({
     ok: true,
     json: async () => ({ success: true })
   });
   \`\`\`

5. **Test Edge Cases**
   - Null/undefined values
   - Empty arrays/objects
   - Boundary values
   - Error conditions

### Test Utilities

Use the provided test helpers in \`tests/utils/test-helpers.js\`:

\`\`\`javascript
import {
  createMockExpense,
  createMockBudget,
  setTestEnv,
  clearTestEnv,
} from '../utils/test-helpers.js';

describe('My Test', () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(() => {
    clearTestEnv();
  });

  it('should work with mock data', () => {
    const expense = createMockExpense({ amount: 100 });
    expect(expense.amount).toBe(100);
  });
});
\`\`\`

---

## Troubleshooting

### Common Issues

#### 1. Tests Failing Locally But Passing in CI

**Cause**: Environment differences

**Solution**:
\`\`\`bash
# Ensure clean node_modules
rm -rf node_modules package-lock.json
npm install

# Run with same flags as CI
npm run test:ci
\`\`\`

#### 2. Coverage Threshold Failures

**Cause**: New code not tested

**Solution**:
- Add tests for uncovered code
- Check \`coverage/index.html\` for uncovered lines
- Write tests for all new functions

#### 3. Timezone-Related Failures

**Cause**: Tests depend on local timezone

**Solution**:
\`\`\`javascript
// Always use IST for date operations
const istDate = new Date(
  date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
);
\`\`\`

#### 4. Mock Not Working

**Cause**: Mock setup timing

**Solution**:
\`\`\`javascript
beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();

  // Setup mocks
  global.fetch = jest.fn().mockResolvedValue({...});
});
\`\`\`

#### 5. Async Test Timeouts

**Cause**: Async operations not completing

**Solution**:
\`\`\`javascript
// Increase timeout for slow tests
jest.setTimeout(10000);

// Always await async operations
await expect(asyncFunction()).resolves.toBe(value);
\`\`\`

### Getting Help

1. Check test output for specific error messages
2. Review failed test details in \`test-report.html\`
3. Check coverage report for untested code
4. Review CI/CD logs in GitHub Actions
5. Consult Jest documentation: https://jestjs.io/

---

## Continuous Improvement

### Adding New Tests

When adding new features:

1. Write tests **before** implementation (TDD)
2. Test all edge cases
3. Maintain coverage above 70%
4. Run tests locally before pushing

### Reviewing Test Quality

Periodically review:

- Test execution time (aim for < 30 seconds)
- Flaky tests (tests that randomly fail)
- Coverage gaps
- Outdated mocks

### Performance Optimization

\`\`\`bash
# Profile test execution
npm test -- --verbose

# Run tests in parallel (default)
npm test -- --maxWorkers=4

# Run tests serially (for debugging)
npm test -- --runInBand
\`\`\`

---

## Quick Reference

### Useful Jest Matchers

\`\`\`javascript
expect(value).toBe(expected);              // Strict equality
expect(value).toEqual(expected);           // Deep equality
expect(value).toBeTruthy();                // Truthy value
expect(value).toBeFalsy();                 // Falsy value
expect(value).toBeGreaterThan(number);     // Numeric comparison
expect(value).toContain(item);             // Array/string contains
expect(value).toMatch(/pattern/);          // Regex match
expect(fn).toThrow();                      // Function throws
expect(promise).resolves.toBe(value);      // Promise resolution
expect(promise).rejects.toThrow();         // Promise rejection
\`\`\`

### Test Lifecycle Hooks

\`\`\`javascript
beforeAll(() => {});     // Runs once before all tests
afterAll(() => {});      // Runs once after all tests
beforeEach(() => {});    // Runs before each test
afterEach(() => {});     // Runs after each test
\`\`\`

### Running Specific Tests

\`\`\`javascript
describe.only('Suite', () => {});  // Only run this suite
it.only('test', () => {});         // Only run this test
describe.skip('Suite', () => {});  // Skip this suite
it.skip('test', () => {});         // Skip this test
\`\`\`

---

## Contributing

When contributing to the test suite:

1. Follow existing test patterns
2. Add tests for all new features
3. Ensure all tests pass locally
4. Update documentation if needed
5. Submit PR with test results

---

**Last Updated**: 2026-01-28

For questions or issues, please open an issue in the repository.
