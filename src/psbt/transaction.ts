import {
  Transaction as ITransaction,
  PsbtInput,
  TransactionFromBuffer,
} from 'bip174/src/lib/interfaces';
import { reverseBuffer } from 'src/bufferutils';
import { Transaction } from 'src/transaction';
import { PsbtCache, TxCacheNumberKey } from './types';
import { checkTxInputCache } from './cache';
import { isFinalized } from './script';
import { inputFinalizeGetAmts } from './input';

/**
 * Check an empty bip174 transaction.
 * @param tx
 * @throws {Error} If the transaction is not empty.
 */
export const checkTxEmpty = (tx: Transaction) => {
  const isEmpty = tx.ins.every(
    input =>
      input.script &&
      input.script.length === 0 &&
      input.witness &&
      input.witness.length === 0,
  );
  if (!isEmpty) {
    throw new Error('Format Error: Transaction ScriptSigs are not empty');
  }
};

export const checkTxForDupeIns = (tx: Transaction, cache: PsbtCache): void => {
  tx.ins.forEach(input => {
    checkTxInputCache(cache, input);
  });
};

export const transactionFromBuffer: TransactionFromBuffer = (
  buffer: Buffer,
): ITransaction => new PsbtTransaction(buffer);

/**
 * This class implements the Transaction interface from bip174 library.
 * It contains a bitcoinjs-lib Transaction object.
 */
export class PsbtTransaction implements ITransaction {
  tx: Transaction;
  constructor(buffer: Buffer = Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])) {
    this.tx = Transaction.fromBuffer(buffer);
    checkTxEmpty(this.tx);
    Object.defineProperty(this, 'tx', {
      enumerable: false,
      writable: true,
    });
  }

  getInputOutputCounts(): {
    inputCount: number;
    outputCount: number;
  } {
    return {
      inputCount: this.tx.ins.length,
      outputCount: this.tx.outs.length,
    };
  }

  addInput(input: any): void {
    if (
      (input as any).hash === undefined ||
      (input as any).index === undefined ||
      (!Buffer.isBuffer((input as any).hash) &&
        typeof (input as any).hash !== 'string') ||
      typeof (input as any).index !== 'number'
    ) {
      throw new Error('Error adding input.');
    }
    const hash =
      typeof input.hash === 'string'
        ? reverseBuffer(Buffer.from(input.hash, 'hex'))
        : input.hash;
    this.tx.addInput(hash, input.index, input.sequence);
  }

  addOutput(output: any): void {
    if (
      (output as any).script === undefined ||
      (output as any).value === undefined ||
      !Buffer.isBuffer((output as any).script) ||
      typeof (output as any).value !== 'number'
    ) {
      throw new Error('Error adding output.');
    }
    this.tx.addOutput(output.script, output.value);
  }

  toBuffer(): Buffer {
    return this.tx.toBuffer();
  }
}

export const nonWitnessUtxoTxFromCache = (
  cache: PsbtCache,
  input: PsbtInput,
  inputIndex: number,
): Transaction => {
  const c = cache.__NON_WITNESS_UTXO_TX_CACHE;
  if (!c[inputIndex]) {
    addNonWitnessTxCache(cache, input, inputIndex);
  }
  return c[inputIndex];
}

export const getTxCacheValue = (
  key: TxCacheNumberKey,
  name: string,
  inputs: PsbtInput[],
  c: PsbtCache,
): number | undefined =>{
  if (!inputs.every(isFinalized))
    throw new Error(`PSBT must be finalized to calculate ${name}`);
  if (key === '__FEE_RATE' && c.__FEE_RATE) return c.__FEE_RATE;
  if (key === '__FEE' && c.__FEE) return c.__FEE;
  let tx: Transaction;
  let mustFinalize = true;
  if (c.__EXTRACTED_TX) {
    tx = c.__EXTRACTED_TX;
    mustFinalize = false;
  } else {
    tx = c.__TX.clone();
  }
  inputFinalizeGetAmts(inputs, tx, c, mustFinalize);
  if (key === '__FEE_RATE') return c.__FEE_RATE!;
  else if (key === '__FEE') return c.__FEE!;
}


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
}
