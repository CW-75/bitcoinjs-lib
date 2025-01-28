import { PsbtCache, PsbtOptsOptional, PsbtParams, PsbtTxOutput } from './types';
import { Psbt as PsbtBase } from 'bip174';
import {
  checkTxForDupeIns,
  PsbtTransaction,
  transactionFromBuffer,
} from './transaction';
import { DEFAULT_OPTS } from './const';
import { check32Bit } from './bit';
import { checkInputsForPartialSig } from './signatures';
import { fromOutputScript } from 'src/address';
import { cloneBuffer } from 'src/bufferutils';

export class PsbtCore {
  protected __CACHE: PsbtCache;
  protected opts: PsbtOptsOptional = {};
  protected data: PsbtBase;

  constructor(
    params: PsbtParams = { data: new PsbtBase(new PsbtTransaction()) },
  ) {
    // set defaults
    this.opts = params.opts ? params.opts : DEFAULT_OPTS;
    this.__CACHE = {
      __NON_WITNESS_UTXO_TX_CACHE: [],
      __NON_WITNESS_UTXO_BUF_CACHE: [],
      __TX_IN_CACHE: {},
      __TX: (params.data.globalMap.unsignedTx as PsbtTransaction).tx,
      // Old TransactionBuilder behavior was to not confirm input values
      // before signing. Even though we highly encourage people to get
      // the full parent transaction to verify values, the ability to
      // sign non-segwit inputs without the full transaction was often
      // requested. So the only way to activate is to use @ts-ignore.
      // We will disable exporting the Psbt when unsafe sign is active.
      // because it is not BIP174 compliant.
      __UNSAFE_SIGN_NONSEGWIT: false,
    };
    this.data = params.data;
    if (this.data.inputs.length === 0) this.setVersion(2);

    // Make data hidden when enumerating
    const dpew = (
      obj: any,
      attr: string,
      enumerable: boolean,
      writable: boolean,
    ): any =>
      Object.defineProperty(obj, attr, {
        enumerable,
        writable,
      });
    dpew(this, '__CACHE', false, true);
    dpew(this, 'opts', false, true);
  }

  /**
   * Set Psbt version   
   * @param version 
   * @returns 
   */
  setVersion(version: number): this {
    check32Bit(version);
    checkInputsForPartialSig(this.data.inputs, 'setVersion');
    const c = this.__CACHE;
    c.__TX.version = version;
    c.__EXTRACTED_TX = undefined;
    return this;
  }

  /** Get Psbt Version */
  get version(): number {
    return this.__CACHE.__TX.version;
  }

  /**
   * Set Psbt Version
   * @param version
   */
  set version(version: number) {
    this.setVersion(version);
  }

  get inputCount(): number {
    return this.data.inputs.length;
  }

  setLocktime(locktime: number): this {
    check32Bit(locktime);
    checkInputsForPartialSig(this.data.inputs, 'setLocktime');
    const c = this.__CACHE;
    c.__TX.locktime = locktime;
    c.__EXTRACTED_TX = undefined;
    return this;
  }


  get locktime(): number {
    return this.__CACHE.__TX.locktime;
  }

  set locktime(locktime: number) {
    this.setLocktime(locktime);
  }

  get txOutputs(): PsbtTxOutput[] {
    return this.__CACHE.__TX.outs.map(output => {
      let address;
      try {
        address = fromOutputScript(output.script, this.opts.network);
      } catch (_) {}
      return {
        script: cloneBuffer(output.script),
        value: BigInt(output.value),
        address,
      };
    });
  }
}
