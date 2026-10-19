// Invoke npm's JavaScript entry point, avoiding platform-specific shell shims.
export function npmCliPath(): string {
  const path = process.env.npm_execpath;
  if (!path) throw new Error('Run the test suite through npm test or npm run test:e2e');
  return path;
}
