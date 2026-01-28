# Expense Bot - Automated Test Suite

## 🎯 Quick Start

\`\`\`bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests with detailed report
npm run test:ci
\`\`\`

## 📊 What Gets Tested

### ✅ Complete Coverage

This automated test suite covers:

1. **Helper Functions** (15+ tests)
   - Message sending to Telegram
   - Date formatting (IST timezone)
   - HTML escaping
   - Timestamp generation

2. **Alert Generation** (25+ tests)
   - Budget threshold detection (90%, 75%, 50%)
   - Daily/weekly/monthly timeframes
   - Expense filtering
   - Message formatting

3. **Expense Parsing** (20+ tests)
   - Basic formats: \`100\`, \`100-food\`, \`100 food\`
   - Multi-amount: \`50+30-food\`
   - Multi-category: \`100-food,grocery\`
   - Comment handling
   - Validation

4. **Webhook Commands** (30+ tests)
   - \`/start\`, \`/help\` - Help system
   - \`/summary\` - Expense summaries
   - \`/owe\` - Settlement calculations
   - \`/categories\` - Budget listing
   - \`/stats\` - Statistics
   - \`/last N\` - Recent expenses
   - \`/search\` - Expense search
   - \`/addcategory\` - Category management
   - \`/revert\` - Undo expenses

5. **Cron Jobs** (20+ tests)
   - Daily summary generation
   - Budget calculations (daily/weekly/monthly)
   - Date filtering (IST)
   - Status determination
   - Authorization

## 🚀 Test Automation

### Automatic Execution

Tests run automatically when you:

- Push to \`main\` or \`develop\` branches
- Create pull requests
- Trigger manual workflow

### What Happens Automatically

1. ✅ **Code Linting** - ESLint checks code quality
2. ✅ **Unit Tests** - Test individual functions
3. ✅ **Integration Tests** - Test command workflows
4. ✅ **Coverage Check** - Ensure 70%+ coverage
5. ✅ **Report Generation** - Create detailed reports
6. ✅ **Artifact Upload** - Store test results
7. ✅ **PR Comments** - Add results to pull requests
8. ✅ **Threshold Validation** - Fail if coverage drops

## 📈 Reports Generated

After each test run, you get:

### 1. HTML Test Report (\`test-report.html\`)

Beautiful, interactive report showing:
- All test results
- Failed test details
- Execution times
- Console logs

### 2. Coverage Report (\`coverage/index.html\`)

Interactive coverage visualization:
- Line-by-line coverage
- File coverage breakdown
- Uncovered lines highlighted
- Branch coverage

### 3. Markdown Report (\`TEST_REPORT.md\`)

Comprehensive document with:
- Coverage summary table
- Test categories
- Known issues
- Recommendations
- File-level coverage

### 4. CI/CD Summary

GitHub Actions shows:
- Test status badges
- Coverage percentages
- Failed test count
- Artifact downloads

## 🔍 What Gets Reported on Failure

When tests fail, you automatically get:

### Immediate Notification
- ❌ GitHub Actions shows red X
- 📧 Email notification (if configured)
- 💬 PR comment with failure details

### Detailed Failure Report

1. **Which tests failed** - Exact test names
2. **Error messages** - Full stack traces
3. **Expected vs Actual** - What went wrong
4. **File locations** - Where to fix
5. **Coverage impact** - How it affects coverage

### Downloadable Artifacts

- \`test-report.html\` - Visual failure report
- \`coverage/\` - Coverage analysis
- \`npm-debug.log\` - Detailed logs
- \`junit.xml\` - Machine-readable results

## 📦 CI/CD Artifacts

All test runs produce downloadable artifacts:

### Success Artifacts (30-day retention)
- Complete coverage report
- HTML test report
- JUnit XML results

### Failure Artifacts (7-day retention)
- Coverage with failed tests highlighted
- Detailed error logs
- Debug information

## 🛠️ Local Development

### Running Tests During Development

\`\`\`bash
# Watch mode - tests re-run on file changes
npm run test:watch

# Run specific test file
npm test tests/unit/helpers.test.js

# Run tests matching pattern
npm test -- --testNamePattern="sendMessage"

# Debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
\`\`\`

### Before Committing

\`\`\`bash
# Run full test suite
npm run test:ci

# Fix linting issues
npm run lint:fix

# Check coverage
open coverage/index.html
\`\`\`

## 🎓 Test Examples

### Example: Unit Test

\`\`\`javascript
describe('sendMessage', () => {
  it('should send message to Telegram', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    await sendMessage(123, 'Test');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Test')
      })
    );
  });
});
\`\`\`

### Example: Integration Test

\`\`\`javascript
describe('/summary command', () => {
  it('should calculate total correctly', () => {
    const expenses = [
      { amount: 100, discarded: false },
      { amount: 200, discarded: false }
    ];

    const total = expenses
      .filter(e => !e.discarded)
      .reduce((sum, e) => sum + e.amount, 0);

    expect(total).toBe(300);
  });
});
\`\`\`

## 🔧 Troubleshooting

### Tests Failing?

1. **Check the test report** - \`test-report.html\`
2. **Review coverage gaps** - \`coverage/index.html\`
3. **Check CI logs** - GitHub Actions tab
4. **Run locally** - \`npm run test:ci\`

### Common Issues

| Issue | Solution |
|-------|----------|
| Coverage too low | Add tests for uncovered code |
| Timezone failures | Use IST timezone helpers |
| Async timeouts | Increase timeout or await properly |
| Mock not working | Clear mocks in \`beforeEach\` |
| Tests slow | Run with \`--maxWorkers=4\` |

## 📋 Coverage Thresholds

Current requirements:

- ✅ **Lines**: 70%
- ✅ **Statements**: 70%
- ✅ **Functions**: 70%
- ✅ **Branches**: 70%

Tests **fail** if coverage drops below thresholds.

## 🤝 Contributing

### Adding Tests

When adding new features:

1. Write tests first (TDD)
2. Ensure tests pass: \`npm test\`
3. Check coverage: \`npm run test:ci\`
4. Update docs if needed
5. Push - tests run automatically

### Test Standards

- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test edge cases
- One assertion per test

## 📚 Documentation

- **Full Testing Guide**: See \`TESTING.md\`
- **Test Helpers**: See \`tests/utils/test-helpers.js\`
- **Jest Docs**: https://jestjs.io/
- **GitHub Actions**: https://docs.github.com/en/actions

## 🏆 Test Statistics

- **Total Tests**: 100+
- **Test Suites**: 5
- **Test Coverage**: 70%+
- **Avg Runtime**: < 30 seconds
- **Node Versions**: 18.x, 20.x

## 📞 Support

For issues:

1. Check \`TESTING.md\` documentation
2. Review test reports and logs
3. Check GitHub Actions for CI issues
4. Open an issue with:
   - Test failure details
   - Error messages
   - Environment info

---

**Remember**: Tests run automatically on every push. If they fail, you'll know exactly what broke and where to fix it!
