import { PsbtInput } from 'bip174/src/lib/interfaces';
import { PsbtCache } from './types';
import { Transaction } from '../transaction';
import { reverseBuffer } from '../bufferutils';

export const addNonWitnessTxCache = (
  cache: PsbtCache,
  input: PsbtInput,
  inputIndex: number,
): void => {
  cache.__NON_WITNESS_UTXO_BUF_CACHE[inputIndex] = input.nonWitnessUtxo!;

  const tx = Transaction.fromBuffer(input.nonWitnessUtxo!);
  cache.__NON_WITNESS_UTXO_TX_CACHE[inputIndex] = tx;

  const self = cache;
  const selfIndex = inputIndex;
  delete input.nonWitnessUtxo;
  Object.defineProperty(input, 'nonWitnessUtxo', {
    enumerable: true,
    get(): Buffer {
      const buf = self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex];
      const txCache = self.__NON_WITNESS_UTXO_TX_CACHE[selfIndex];
      if (buf !== undefined) {
        return buf;
      } else {
        const newBuf = txCache.toBuffer();
        self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex] = newBuf;
        return newBuf;
      }
    },
    set(data: Buffer): void {
      self.__NON_WITNESS_UTXO_BUF_CACHE[selfIndex] = data;
    },
  });
};

export const checkTxInputCache = (
    cache: PsbtCache,
    input: { hash: Buffer; index: number },
  ): void =>{
    const key =
      reverseBuffer(Buffer.from(input.hash)).toString('hex') + ':' + input.index;
    if (cache.__TX_IN_CACHE[key]) throw new Error('Duplicate input detected.');
    cache.__TX_IN_CACHE[key] = 1;
  }
  
export const checkCache = (cache: PsbtCache): void => {
    if (cache.__UNSAFE_SIGN_NONSEGWIT !== false) {
      throw new Error('Not BIP174 compliant, can not export');
    }
}