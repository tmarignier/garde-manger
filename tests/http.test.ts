import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { HttpError, readJson } from '../server/http.ts';

describe('readJson', () => {
  it('parses a JSON body sent in several chunks', async () => {
    assert.deepEqual(await readJson(Readable.from(['{"delta":', ' -1}'])), { delta: -1 });
  });

  it('returns undefined for an empty body', async () => {
    assert.equal(await readJson(Readable.from([])), undefined);
  });

  it('rejects invalid JSON with a 400 error', async () => {
    await assert.rejects(readJson(Readable.from(['{oops'])), (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      return true;
    });
  });

  it('rejects a body larger than 1 MB with a 413 error', async () => {
    const chunk = Buffer.alloc(512 * 1024, 'a');
    await assert.rejects(readJson(Readable.from([chunk, chunk, chunk])), (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 413);
      return true;
    });
  });
});
