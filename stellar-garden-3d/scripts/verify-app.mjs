import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const port = Number(process.env.VERIFY_PORT || 4891);
const baseUrl = `http://127.0.0.1:${port}`;
const screenshotDir = path.join(projectDir, 'screenshots');

fs.mkdirSync(screenshotDir, { recursive: true });

const server = spawn(process.execPath, ['server.js'], {
  cwd: projectDir,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Server did not become ready in time.');
}

function assertCanvasHasSignal(buffer, label) {
  const png = PNG.sync.read(buffer);
  let brightPixels = 0;
  const samples = new Set();

  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];
    if (r + g + b > 80) brightPixels += 1;
    if (index % 64 === 0) samples.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
  }

  if (brightPixels < 900 || samples.size < 24) {
    throw new Error(`${label} canvas looks blank: bright=${brightPixels}, colors=${samples.size}`);
  }
}

async function runViewport(page, label, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__stellarGardenReady === true);
  await page.waitForTimeout(700);

  const canvas = page.locator('#scene-canvas');
  await canvas.waitFor({ state: 'visible' });
  const image = await canvas.screenshot({ path: path.join(screenshotDir, `${label}-canvas.png`) });
  assertCanvasHasSignal(image, label);

  await page.screenshot({ path: path.join(screenshotDir, `${label}-page.png`), fullPage: true });

  const panelBoxes = await page.locator('.control-panel, .detail-panel').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };
    })
  );

  for (const box of panelBoxes) {
    if (box.width < 260 || box.height < 100 || box.left < -1 || box.top < -1) {
      throw new Error(`${label} panel layout is out of bounds: ${JSON.stringify(box)}`);
    }
  }
}

async function verifyCrud(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__stellarGardenReady === true);

  const uniqueName = `검증별 ${Date.now()}`;
  const before = await page.locator('.star-list-item').count();
  await page.fill('#star-name', uniqueName);
  await page.fill('#star-note', 'Playwright가 심은 테스트 별');
  await page.locator('.swatch[data-color="#4ecdc4"]').click();
  await page.locator('button.primary-action').click();
  await page.waitForFunction((name) => [...document.querySelectorAll('.star-list-name')].some((node) => node.textContent === name), uniqueName);

  const after = await page.locator('.star-list-item').count();
  if (after !== before + 1) {
    throw new Error(`Expected a new star in the list. before=${before}, after=${after}`);
  }

  await page.locator('button', { hasText: '반짝이기' }).click();
  await page.waitForFunction(() => /1회 반짝임/.test(document.querySelector('.detail-meta')?.textContent || ''));

  await page.locator('button', { hasText: '지우기' }).click();
  await page.waitForFunction((name) => ![...document.querySelectorAll('.star-list-name')].some((node) => node.textContent === name), uniqueName);
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await runViewport(page, 'desktop', { width: 1440, height: 950 });
  await verifyCrud(page);
  await runViewport(page, 'mobile', { width: 390, height: 844 });

  await browser.close();

  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors:\n${consoleErrors.join('\n')}`);
  }

  console.log('Verification passed: API CRUD, desktop/mobile render, and canvas pixel signal are healthy.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
  });
