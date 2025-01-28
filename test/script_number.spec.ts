import * as assert from 'assert';
import { describe, it } from 'vitest';
import * as scriptNumber from '../src/script_number';
import * as fixtures from './fixtures/script_number.json';

interface scripTestFixture {
  hex: string;
  number: number;
}

describe('script-number', () => {
  describe('decode', () => {
    fixtures.forEach(f => {
      it(f.hex + ' returns ' + f.number, () => {
        const actual = scriptNumber.decode(Buffer.from(f.hex, 'hex'), f.bytes);

        assert.strictEqual(actual, f.number);
      });
    });
  });

  describe('encode', () => {
    (fixtures as scripTestFixture[]).forEach(f => {
      it(f.number + ' returns ' + f.hex, () => {
        const actual = scriptNumber.encode(f.number);

        assert.strictEqual(actual.toString('hex'), f.hex);
      });
    });
  });
});
