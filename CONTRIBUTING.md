# Contributing to ResponseAble

Open an issue for reproducible bugs or proposed features. Include the application version, browser, deployment mode, expected behavior, and reproduction steps using synthetic data. Use a private disclosure channel for security reports containing sensitive details. Keep credentials, guest links, phone numbers and real incident records out of public reports.

For a code change, follow the quick start in the README and use a separate PostgreSQL database for testing. Run `npm run build`, `npm run typecheck` and `npm test`. Exercise any affected media flows with a local LiveKit instance and any affected phone flows with a mock gateway. Include the verification results in the pull request.

Keep new UI strings in German to match the current application. Make schema migrations compatible with the previous release during a rolling deployment. Commit source assets and their licenses, with synthetic data in examples and screenshots.
