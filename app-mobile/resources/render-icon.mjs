#!/usr/bin/env node
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP = {
  'icon-source.svg': 'icon.png',
  'icon-background.svg': 'icon-background.png',
  'icon-foreground.svg': 'icon-foreground.png',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [svgName, pngName] of Object.entries(MAP)) {
  await page.goto('file://' + path.join(__dirname, svgName));
  await page.screenshot({ path: path.join(__dirname, pngName) });
  console.log('Gerado', pngName);
}
await browser.close();
