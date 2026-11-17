import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grmn-uploads-'));
process.env.UPLOAD_DIR = tmp;

const { sniffImageType, saveImage, resolveUploadFile, downloadRemoteImage, uploadDir } = await import(
  '../src/lib/media/storage.js'
);

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Uint8Array.from([...Buffer.from('RIFF'), 0x24, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, ...Buffer.from('ftypavif'), 0, 0, 0, 0]);

test('uploadDir honours UPLOAD_DIR', () => {
  assert.equal(path.resolve(uploadDir()), path.resolve(tmp));
});

test('sniffImageType detects jpeg/png/webp/avif by signature', () => {
  assert.equal(sniffImageType(JPEG), 'jpeg');
  assert.equal(sniffImageType(PNG), 'png');
  assert.equal(sniffImageType(WEBP), 'webp');
  assert.equal(sniffImageType(AVIF), 'avif');
});

test('sniffImageType rejects a text file named .jpg and an svg', () => {
  assert.equal(sniffImageType(Buffer.from('hello, I am not an image')), null);
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

test('saveImage writes under UPLOAD_DIR and returns a /uploads src', async () => {
  const { src, file } = await saveImage(JPEG, { folder: 'products' });
  assert.match(src, /^\/uploads\/products\/\d{4}\/[0-9a-f-]{36}\.jpg$/);
  assert.ok(path.resolve(file).startsWith(path.resolve(tmp)));
  assert.deepEqual(new Uint8Array(fs.readFileSync(file)), JPEG);
});

test('saveImage refuses non-images and unsafe folders', async () => {
  await assert.rejects(() => saveImage(Buffer.from('nope'), { folder: 'products' }));
  await assert.rejects(() => saveImage(JPEG, { folder: '../outside' }));
});

test('resolveUploadFile serves saved files and blocks traversal', async () => {
  const { src } = await saveImage(PNG, { folder: 'products' });
  const segments = src.replace(/^\/uploads\//, '').split('/');
  assert.ok(resolveUploadFile(segments));
  assert.equal(resolveUploadFile(['..', 'etc', 'passwd']), null);
  assert.equal(resolveUploadFile(['%2e%2e', 'package.json']), null);
  assert.equal(resolveUploadFile(['..%2f..%2fpackage.json']), null);
  assert.equal(resolveUploadFile(['/abs']), null);
  assert.equal(resolveUploadFile(['products\\..\\..\\x']), null);
  assert.equal(resolveUploadFile(['products', 'missing.jpg']), null);
});

test('downloadRemoteImage refuses non-Garmin hosts without touching the network', async () => {
  const r1 = await downloadRemoteImage('https://evil.com/a.jpg', { folder: 'products/garmin' });
  assert.ok('error' in r1);
  const r2 = await downloadRemoteImage('http://res.garmin.com/a.jpg', { folder: 'products/garmin' });
  assert.ok('error' in r2);
  const r3 = await downloadRemoteImage('https://res.garmin.com.evil.io/a.jpg', { folder: 'products/garmin' });
  assert.ok('error' in r3);
});

describe('routes (needs BASE_URL)', { skip: !process.env.BASE_URL }, () => {
  const base = process.env.BASE_URL;
  test('unauthenticated upload → 401', async () => {
    const fd = new FormData();
    fd.append('files', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg');
    const res = await fetch(`${base}/api/admin/uploads`, { method: 'POST', body: fd });
    assert.equal(res.status, 401);
  });
  test('traversal on /uploads is refused (400 from Next or 404 from the route) and never leaks files', async () => {
    for (const p of ['..%2f..%2fpackage.json', '%2e%2e/%2e%2e/package.json', 'products/..%5c..%5cpackage.json']) {
      const res = await fetch(`${base}/uploads/${p}`);
      assert.ok([400, 404].includes(res.status), `${p} → ${res.status}`);
      assert.doesNotMatch(await res.text(), /"dependencies"/);
    }
  });
});
