# Salesforce CRM Automation (Playwright + TypeScript)

End-to-end UI automation framework for Salesforce CRM built with Playwright and TypeScript.

## Prerequisites

- Node.js >= 20
- npm >= 10

## Setup

1. Install dependencies and browser binaries:
   ```bash
   npm install
   npx playwright install chromium webkit
   ```

2. Configure local environment variables:
   ```bash
   cp environments/.env.example environments/.env.local
   ```
   Fill in your credentials in `environments/.env.local`:
   - `SF_INSTANCE_URL`: Salesforce org instance URL
   - `SF_USERNAME`: Salesforce login username
   - `SF_PASSWORD`: Salesforce login password
   - `SF_CLIENT_ID`: Connected App Consumer Key (for JWT auth & API seeding)
   - `SF_PRIVATE_KEY`: RSA private key string (single-line format with `\n`)
   - `SF_IMAP_USER`: Gmail address receiving Salesforce verification emails
   - `SF_IMAP_PASSWORD`: Gmail App Password (with IMAP enabled)

## Running Tests

```bash
# Run tests on Chromium (default)
npm test

# Run tests on WebKit (Safari)
npm run test:webkit

# Run all test suites across Chromium and WebKit
npm run test:all

# Run only the email OTP verification flow
npm run test:otp

# Run tests with browser UI visible
npx playwright test --headed
```

## Viewing Test Reports

Open the interactive HTML report generated after a test run:
```bash
npm run report
```

To view a Playwright trace from a failed test run:
```bash
npm run trace <path-to-trace.zip>
```
