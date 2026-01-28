#!/usr/bin/env node

/**
 * Test Suite Setup and Validation Script
 * 
 * This script helps set up the testing environment and validates
 * that everything is configured correctly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function header(message) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(message, colors.bright);
  log('='.repeat(60), colors.bright);
}

function checkFile(filepath, description) {
  if (fs.existsSync(filepath)) {
    success(`${description} exists`);
    return true;
  } else {
    error(`${description} not found: ${filepath}`);
    return false;
  }
}

function checkDirectory(dirpath, description) {
  if (fs.existsSync(dirpath) && fs.statSync(dirpath).isDirectory()) {
    success(`${description} exists`);
    return true;
  } else {
    warning(`${description} not found: ${dirpath}`);
    return false;
  }
}

async function validateTestSetup() {
  header('🔍 Validating Test Suite Setup');

  let allValid = true;

  // Check package.json
  info('\n📦 Checking package.json...');
  const packageJsonPath = path.join(__dirname, '../package.json');
  if (checkFile(packageJsonPath, 'package.json')) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check scripts
    const requiredScripts = ['test', 'test:ci', 'test:unit', 'test:integration'];
    let scriptsValid = true;
    
    for (const script of requiredScripts) {
      if (packageJson.scripts && packageJson.scripts[script]) {
        success(`Script "${script}" configured`);
      } else {
        error(`Script "${script}" missing`);
        scriptsValid = false;
      }
    }
    
    allValid = allValid && scriptsValid;
    
    // Check dependencies
    const requiredDevDeps = ['jest', 'jest-html-reporter'];
    let depsValid = true;
    
    for (const dep of requiredDevDeps) {
      if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
        success(`Dependency "${dep}" installed`);
      } else {
        error(`Dependency "${dep}" missing`);
        depsValid = false;
      }
    }
    
    allValid = allValid && depsValid;
  } else {
    allValid = false;
  }

  // Check test directories
  info('\n📁 Checking test directories...');
  const testDirs = [
    [path.join(__dirname, '../tests'), 'tests/'],
    [path.join(__dirname, '../tests/unit'), 'tests/unit/'],
    [path.join(__dirname, '../tests/integration'), 'tests/integration/'],
    [path.join(__dirname, '../tests/utils'), 'tests/utils/'],
  ];

  for (const [dir, desc] of testDirs) {
    if (!checkDirectory(dir, desc)) {
      allValid = false;
    }
  }

  // Check test files
  info('\n📄 Checking test files...');
  const testFiles = [
    [path.join(__dirname, '../tests/unit/helpers.test.js'), 'helpers.test.js'],
    [path.join(__dirname, '../tests/unit/alerts.test.js'), 'alerts.test.js'],
    [path.join(__dirname, '../tests/unit/expense-parsing.test.js'), 'expense-parsing.test.js'],
    [path.join(__dirname, '../tests/integration/webhook.test.js'), 'webhook.test.js'],
    [path.join(__dirname, '../tests/integration/cron.test.js'), 'cron.test.js'],
    [path.join(__dirname, '../tests/integration/budget-settlement.test.js'), 'budget-settlement.test.js'],
    [path.join(__dirname, '../tests/utils/test-helpers.js'), 'test-helpers.js'],
  ];

  for (const [file, desc] of testFiles) {
    if (!checkFile(file, desc)) {
      allValid = false;
    }
  }

  // Check configuration files
  info('\n⚙️  Checking configuration files...');
  const configFiles = [
    [path.join(__dirname, '../jest.config.js'), 'jest.config.js'],
    [path.join(__dirname, '../.eslintrc.json'), '.eslintrc.json'],
    [path.join(__dirname, '../.gitignore'), '.gitignore'],
  ];

  for (const [file, desc] of configFiles) {
    if (!checkFile(file, desc)) {
      allValid = false;
    }
  }

  // Check CI/CD workflow
  info('\n🔄 Checking CI/CD configuration...');
  const workflowPath = path.join(__dirname, '../.github/workflows/test.yml');
  if (checkFile(workflowPath, 'GitHub Actions workflow')) {
    success('CI/CD pipeline configured');
  } else {
    warning('GitHub Actions workflow not found - CI/CD will not run automatically');
  }

  // Check documentation
  info('\n📚 Checking documentation...');
  const docFiles = [
    [path.join(__dirname, '../TESTING.md'), 'TESTING.md'],
    [path.join(__dirname, '../README_TESTING.md'), 'README_TESTING.md'],
  ];

  for (const [file, desc] of docFiles) {
    checkFile(file, desc);
  }

  // Check node_modules
  info('\n📦 Checking dependencies installation...');
  const nodeModulesPath = path.join(__dirname, '../node_modules');
  if (checkDirectory(nodeModulesPath, 'node_modules')) {
    success('Dependencies are installed');
  } else {
    error('Dependencies not installed. Run: npm install');
    allValid = false;
  }

  // Summary
  header('📊 Validation Summary');
  
  if (allValid) {
    success('All checks passed! Test suite is ready to use.');
    info('\n🚀 Quick start:');
    info('  npm test              - Run all tests');
    info('  npm run test:ci       - Run with coverage');
    info('  npm run test:watch    - Watch mode');
    info('  npm run lint          - Run linter');
    
    return true;
  } else {
    error('Some checks failed. Please fix the issues above.');
    info('\n🔧 Common fixes:');
    info('  npm install           - Install missing dependencies');
    info('  npm run setup         - Re-run setup script');
    
    return false;
  }
}

async function runDiagnostics() {
  header('🔬 Running Diagnostics');

  info('\n📊 System Information:');
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    
    success(`Node.js: ${nodeVersion}`);
    success(`npm: ${npmVersion}`);
    
    if (nodeVersion.startsWith('v18') || nodeVersion.startsWith('v20')) {
      success('Node.js version is compatible');
    } else {
      warning(`Node.js ${nodeVersion} - Recommended: v18.x or v20.x`);
    }
  } catch (err) {
    error('Failed to get system information');
  }

  info('\n🧪 Test Statistics:');
  try {
    const testFiles = [
      path.join(__dirname, '../tests/unit'),
      path.join(__dirname, '../tests/integration'),
    ];
    
    let totalTests = 0;
    
    for (const dir of testFiles) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
        totalTests += files.length;
        info(`  ${path.basename(dir)}: ${files.length} test files`);
      }
    }
    
    success(`Total test files: ${totalTests}`);
  } catch (err) {
    error('Failed to count test files');
  }

  info('\n💾 Storage:');
  try {
    const coverageDir = path.join(__dirname, '../coverage');
    if (fs.existsSync(coverageDir)) {
      const size = getDirSize(coverageDir);
      info(`  Coverage reports: ${formatBytes(size)}`);
    } else {
      info('  Coverage reports: Not generated yet');
    }
  } catch (err) {
    warning('Failed to check storage');
  }
}

function getDirSize(dirPath) {
  let totalSize = 0;
  
  function traverse(currentPath) {
    const stats = fs.statSync(currentPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(currentPath);
      files.forEach(file => {
        traverse(path.join(currentPath, file));
      });
    } else {
      totalSize += stats.size;
    }
  }
  
  traverse(dirPath);
  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function suggestImprovements() {
  header('💡 Suggestions for Improvement');

  const suggestions = [];

  // Check for .env.test
  if (!fs.existsSync(path.join(__dirname, '../.env.test'))) {
    suggestions.push({
      title: 'Create .env.test file',
      description: 'Store test environment variables separately',
      command: 'Create .env.test with test credentials',
    });
  }

  // Check test coverage
  const coverageSummaryPath = path.join(__dirname, '../coverage/coverage-summary.json');
  if (fs.existsSync(coverageSummaryPath)) {
    const coverage = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
    const total = coverage.total;
    
    if (total.lines.pct < 80) {
      suggestions.push({
        title: 'Increase test coverage',
        description: `Current line coverage: ${total.lines.pct}%`,
        command: 'Add tests for uncovered code',
      });
    }
  }

  // Check for outdated dependencies
  info('\n🔍 Checking for outdated dependencies...');
  try {
    execSync('npm outdated', { encoding: 'utf8', stdio: 'inherit' });
  } catch (err) {
    // npm outdated returns non-zero exit code when there are outdated packages
    info('  Some dependencies may be outdated. Run: npm outdated');
  }

  if (suggestions.length > 0) {
    info('\n📝 Recommendations:');
    suggestions.forEach((s, i) => {
      info(`\n${i + 1}. ${s.title}`);
      info(`   ${s.description}`);
      info(`   → ${s.command}`);
    });
  } else {
    success('No immediate improvements needed!');
  }
}

// Main execution
async function main() {
  log('\n🧪 Expense Bot - Test Suite Setup & Validation\n', colors.bright);

  const isValid = await validateTestSetup();
  await runDiagnostics();
  await suggestImprovements();

  header('✨ Setup Complete');

  if (isValid) {
    success('Test suite is ready to use!');
    info('\n📖 Next steps:');
    info('  1. Read TESTING.md for detailed documentation');
    info('  2. Run npm test to execute the test suite');
    info('  3. Check test-report.html for results');
    info('  4. Push to trigger CI/CD pipeline');
    
    process.exit(0);
  } else {
    error('Please fix the issues above before proceeding.');
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    error(`Setup failed: ${err.message}`);
    process.exit(1);
  });
}

export { validateTestSetup, runDiagnostics };
