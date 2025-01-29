import { PsbtCore } from './core';
import {
  checkInputsForPartialSig,
  checkPartialSigSighashes,
  getSignersFromHD,
} from './signatures';
import { checkInvalidP2WSH } from './protocol';
import { addNonWitnessTxCache, checkTxInputCache } from './cache';
import { check32Bit } from './bit';
import { toOutputScript } from '../address';
import {
  AllScriptType,
  FinalScriptsFunc,
  HDSigner,
  HDSignerAsync,
  PsbtInputExtended,
  PsbtOutputExtended,
} from './types';
import { checkForInput, checkForOutput } from 'bip174/src/lib/utils';
import {
  checkScriptForPubkey,
  classifyScript,
  getFinalScripts,
  getMeaningfulScript,
  getScriptFromInput,
  getScriptFromUtxo,
  redeemFromFinalScriptSig,
  redeemFromFinalWitnessScript,
} from './script';
import { range } from './utils';
import { pubkeyInInput, pubkeyInOutput } from './pubkey';
import * as bscript from '../script';
import { getHashAndSighashType, getHashForSig } from './hash';
import {
  fromPublicKey as ecPairFromPublicKey,
  Signer,
  SignerAsync,
} from '../ecpair';
import { Transaction } from '../transaction';
import {
  KeyValue,
  PsbtInputUpdate,
  PsbtOutputUpdate,
} from 'bip174/src/lib/interfaces';
import { bip32DerivationIsMine } from './const';

/**
 * Group of methods to add inputs to a Psbt object.
 */
export class PsbtActions extends PsbtCore {
  // Interactions with the Inputs

  /**
   * Add multiple utxo inputs to the transaction.
   * @param inputDatas array of utxo inputs
   * @returns
   */
  addInputs(inputDatas: PsbtInputExtended[]): this {
    inputDatas.forEach(inputData => this.addInput(inputData));
    return this;
  }

  /**
   * Add an utxo input to the transaction.
   * @param inputData
   * @returns
   */
  addInput(inputData: PsbtInputExtended): this {
    if (
      arguments.length > 1 ||
      !inputData ||
      inputData.hash === undefined ||
      inputData.index === undefined
    ) {
      throw new Error(
        `Invalid arguments for Psbt.addInput. ` +
          `Requires single object with at least [hash] and [index]`,
      );
    }
    checkInputsForPartialSig(this.data.inputs, 'addInput');
    if (inputData.witnessScript) checkInvalidP2WSH(inputData.witnessScript);
    const c = this.__CACHE;
    this.data.addInput(inputData);
    const txIn = c.__TX.ins[c.__TX.ins.length - 1];
    checkTxInputCache(c, txIn);
    const inputIndex = this.data.inputs.length - 1;
    const input = this.data.inputs[inputIndex];
    if (input.nonWitnessUtxo) {
      addNonWitnessTxCache(this.__CACHE, input, inputIndex);
    }
    c.__FEE = undefined;
    c.__FEE_RATE = undefined;
    c.__EXTRACTED_TX = undefined;
    return this;
  }

  setInputSequence(inputIndex: number, sequence: number): this {
    check32Bit(sequence);
    checkInputsForPartialSig(this.data.inputs, 'setInputSequence');
    const c = this.__CACHE;
    if (c.__TX.ins.length <= inputIndex) {
      throw new Error('Input index too high');
    }
    c.__TX.ins[inputIndex].sequence = sequence;
    c.__EXTRACTED_TX = undefined;
    return this;
  }

  finalizeAllInputs(): this {
    checkForInput(this.data.inputs, 0); // making sure we have at least one
    range(this.data.inputs.length).forEach(idx => this.finalizeInput(idx));
    return this;
  }

  finalizeInput(
    inputIndex: number,
    finalScriptsFunc: FinalScriptsFunc = getFinalScripts,
  ): this {
    const input = checkForInput(this.data.inputs, inputIndex);
    const { script, isP2SH, isP2WSH, isSegwit } = getScriptFromInput(
      inputIndex,
      input,
      this.__CACHE,
    );
    if (!script) throw new Error(`No script found for input #${inputIndex}`);
    checkPartialSigSighashes(input);
    const { finalScriptSig, finalScriptWitness } = finalScriptsFunc(
      inputIndex,
      input,
      script,
      isSegwit,
      isP2SH,
      isP2WSH,
    );

    if (finalScriptSig) this.data.updateInput(inputIndex, { finalScriptSig });
    if (finalScriptWitness)
      this.data.updateInput(inputIndex, { finalScriptWitness });
    if (!finalScriptSig && !finalScriptWitness)
      throw new Error(`Unknown error finalizing input #${inputIndex}`);

    this.data.clearFinalizedInput(inputIndex);
    return this;
  }

  getInputType(inputIndex: number): AllScriptType {
    const input = checkForInput(this.data.inputs, inputIndex);
    const script = getScriptFromUtxo(inputIndex, input, this.__CACHE);
    const result = getMeaningfulScript(
      script,
      inputIndex,
      'input',
      input.redeemScript || redeemFromFinalScriptSig(input.finalScriptSig),
      input.witnessScript ||
        redeemFromFinalWitnessScript(input.finalScriptWitness),
    );
    const type = result.type === 'raw' ? '' : result.type + '-';
    const mainType = classifyScript(result.meaningfulScript);
    return (type + mainType) as AllScriptType;
  }

  inputHasPubkey(inputIndex: number, pubkey: Buffer): boolean {
    const input = checkForInput(this.data.inputs, inputIndex);

    return pubkeyInInput(pubkey, input, inputIndex, this.__CACHE);
  }

  inputHasHDKey(inputIndex: number, root: HDSigner): boolean {
    const input = checkForInput(this.data.inputs, inputIndex);
    const derivationIsMine = bip32DerivationIsMine(root);
    return (
      !!input.bip32Derivation && input.bip32Derivation.some(derivationIsMine)
    );
  }

  validateSignaturesOfAllInputs(): boolean {
    checkForInput(this.data.inputs, 0); // making sure we have at least one
    const results = range(this.data.inputs.length).map(idx =>
      this.validateSignaturesOfInput(idx),
    );
    return results.reduce((final, res) => res === true && final, true);
  }

  validateSignaturesOfInput(inputIndex: number, pubkey?: Buffer): boolean {
    const input = this.data.inputs[inputIndex];
    const partialSig = (input || {}).partialSig;
    if (!input || !partialSig || partialSig.length < 1)
      throw new Error('No signatures to validate');
    const mySigs = pubkey
      ? partialSig.filter(sig => sig.pubkey.equals(pubkey))
      : partialSig;
    if (mySigs.length < 1) throw new Error('No signatures for this pubkey');
    const results: boolean[] = [];
    let hashCache: Buffer;
    let scriptCache: Buffer;
    let sighashCache: number;
    for (const pSig of mySigs) {
      const sig = bscript.signature.decode(pSig.signature);
      const { hash, script } =
        sighashCache! !== sig.hashType
          ? getHashForSig(
              inputIndex,
              Object.assign({}, input, { sighashType: sig.hashType }),
              this.__CACHE,
              true,
            )
          : { hash: hashCache!, script: scriptCache! };
      sighashCache = sig.hashType;
      hashCache = hash;
      scriptCache = script;
      checkScriptForPubkey(pSig.pubkey, script, 'verify');
      const keypair = ecPairFromPublicKey(pSig.pubkey);
      results.push(keypair.verify(hash, sig.signature));
    }
    return results.every(res => res === true);
  }

  signAllInputsHD(
    hdKeyPair: HDSigner,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): this {
    if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
      throw new Error('Need HDSigner to sign input');
    }

    const results: boolean[] = [];
    for (const i of range(this.data.inputs.length)) {
      try {
        this.signInputHD(i, hdKeyPair, sighashTypes);
        results.push(true);
      } catch (err) {
        results.push(false);
      }
    }
    if (results.every(v => v === false)) {
      throw new Error('No inputs were signed');
    }
    return this;
  }

  signAllInputsHDAsync(
    hdKeyPair: HDSigner | HDSignerAsync,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): Promise<void> {
    return new Promise(
      (resolve, reject): any => {
        if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
          return reject(new Error('Need HDSigner to sign input'));
        }

        const results: boolean[] = [];
        const promises: Array<Promise<void>> = [];
        for (const i of range(this.data.inputs.length)) {
          promises.push(
            this.signInputHDAsync(i, hdKeyPair, sighashTypes).then(
              () => {
                results.push(true);
              },
              () => {
                results.push(false);
              },
            ),
          );
        }
        return Promise.all(promises).then(() => {
          if (results.every(v => v === false)) {
            return reject(new Error('No inputs were signed'));
          }
          resolve();
        });
      },
    );
  }

  signInputHD(
    inputIndex: number,
    hdKeyPair: HDSigner,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): this {
    if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
      throw new Error('Need HDSigner to sign input');
    }
    const signers = getSignersFromHD(
      inputIndex,
      this.data.inputs,
      hdKeyPair,
    ) as Signer[];
    signers.forEach(signer => this.signInput(inputIndex, signer, sighashTypes));
    return this;
  }

  signInputHDAsync(
    inputIndex: number,
    hdKeyPair: HDSigner | HDSignerAsync,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): Promise<void> {
    return new Promise(
      (resolve, reject): any => {
        if (!hdKeyPair || !hdKeyPair.publicKey || !hdKeyPair.fingerprint) {
          return reject(new Error('Need HDSigner to sign input'));
        }
        const signers = getSignersFromHD(
          inputIndex,
          this.data.inputs,
          hdKeyPair,
        );
        const promises = signers.map(signer =>
          this.signInputAsync(inputIndex, signer, sighashTypes),
        );
        return Promise.all(promises)
          .then(() => {
            resolve();
          })
          .catch(reject);
      },
    );
  }

  signAllInputs(
    keyPair: Signer,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): this {
    if (!keyPair || !keyPair.publicKey)
      throw new Error('Need Signer to sign input');

    // TODO: Add a pubkey/pubkeyhash cache to each input
    // as input information is added, then eventually
    // optimize this method.
    const results: boolean[] = [];
    for (const i of range(this.data.inputs.length)) {
      try {
        this.signInput(i, keyPair, sighashTypes);
        results.push(true);
      } catch (err) {
        results.push(false);
      }
    }
    if (results.every(v => v === false)) {
      throw new Error('No inputs were signed');
    }
    return this;
  }

  signAllInputsAsync(
    keyPair: Signer | SignerAsync,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): Promise<void> {
    return new Promise(
      (resolve, reject): any => {
        if (!keyPair || !keyPair.publicKey)
          return reject(new Error('Need Signer to sign input'));

        // TODO: Add a pubkey/pubkeyhash cache to each input
        // as input information is added, then eventually
        // optimize this method.
        const results: boolean[] = [];
        const promises: Array<Promise<void>> = [];
        for (const [i] of this.data.inputs.entries()) {
          promises.push(
            this.signInputAsync(i, keyPair, sighashTypes).then(
              () => {
                results.push(true);
              },
              () => {
                results.push(false);
              },
            ),
          );
        }
        return Promise.all(promises).then(() => {
          if (results.every(v => v === false)) {
            return reject(new Error('No inputs were signed'));
          }
          resolve();
        });
      },
    );
  }

  signInput(
    inputIndex: number,
    keyPair: Signer,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): this {
    if (!keyPair || !keyPair.publicKey)
      throw new Error('Need Signer to sign input');
    const { hash, sighashType } = getHashAndSighashType(
      this.data.inputs,
      inputIndex,
      keyPair.publicKey,
      this.__CACHE,
      sighashTypes,
    );

    const partialSig = [
      {
        pubkey: keyPair.publicKey,
        signature: bscript.signature.encode(keyPair.sign(hash), sighashType),
      },
    ];

    this.data.updateInput(inputIndex, { partialSig });
    return this;
  }

  signInputAsync(
    inputIndex: number,
    keyPair: Signer | SignerAsync,
    sighashTypes: number[] = [Transaction.SIGHASH_ALL],
  ): Promise<void> {
    return Promise.resolve().then(() => {
      if (!keyPair || !keyPair.publicKey)
        throw new Error('Need Signer to sign input');
      const { hash, sighashType } = getHashAndSighashType(
        this.data.inputs,
        inputIndex,
        keyPair.publicKey,
        this.__CACHE,
        sighashTypes,
      );

      return Promise.resolve(keyPair.sign(hash)).then(signature => {
        const partialSig = [
          {
            pubkey: keyPair.publicKey,
            signature: bscript.signature.encode(signature, sighashType),
          },
        ];

        this.data.updateInput(inputIndex, { partialSig });
      });
    });
  }

  updateInput(inputIndex: number, updateData: PsbtInputUpdate): this {
    if (updateData.witnessScript) checkInvalidP2WSH(updateData.witnessScript);
    this.data.updateInput(inputIndex, updateData);
    if (updateData.nonWitnessUtxo) {
      addNonWitnessTxCache(
        this.__CACHE,
        this.data.inputs[inputIndex],
        inputIndex,
      );
    }
    return this;
  }

  addUnknownKeyValToInput(inputIndex: number, keyVal: KeyValue): this {
    this.data.addUnknownKeyValToInput(inputIndex, keyVal);
    return this;
  }

  clearFinalizedInput(inputIndex: number): this {
    this.data.clearFinalizedInput(inputIndex);
    return this;
  }
  // ***********************************************
  // ------- Interactions with the Outputs ---------
  // ***********************************************

  /**
   * Adds multiple outputs to the transaction.
   * @param outputDatas
   * @returns
   */
  addOutputs(outputDatas: PsbtOutputExtended[]): this {
    outputDatas.forEach(outputData => this.addOutput(outputData));
    return this;
  }

  /**
   * add an output to the transaction.
   * @param outputData
   * @returns
   */
  addOutput(outputData: PsbtOutputExtended): this {
    if (
      arguments.length > 1 ||
      !outputData ||
      outputData.value === undefined ||
      ((outputData as any).address === undefined &&
        (outputData as any).script === undefined)
    ) {
      throw new Error(
        `Invalid arguments for Psbt.addOutput. ` +
          `Requires single object with at least [script or address] and [value]`,
      );
    }
    checkInputsForPartialSig(this.data.inputs, 'addOutput');
    const { address } = outputData as any;
    if (typeof address === 'string') {
      const { network } = this.opts;
      const script = toOutputScript(address, network);
      outputData = Object.assign(outputData, { script });
    }
    const c = this.__CACHE;
    this.data.addOutput(outputData);
    c.__FEE = undefined;
    c.__FEE_RATE = undefined;
    c.__EXTRACTED_TX = undefined;
    return this;
  }

  outputHasPubkey(outputIndex: number, pubkey: Buffer): boolean {
    const output = checkForOutput(this.data.outputs, outputIndex);
    return pubkeyInOutput(pubkey, output, outputIndex, this.__CACHE);
  }

  outputHasHDKey(outputIndex: number, root: HDSigner): boolean {
    const output = checkForOutput(this.data.outputs, outputIndex);
    const derivationIsMine = bip32DerivationIsMine(root);
    return (
      !!output.bip32Derivation && output.bip32Derivation.some(derivationIsMine)
    );
  }

  updateOutput(outputIndex: number, updateData: PsbtOutputUpdate): this {
    this.data.updateOutput(outputIndex, updateData);
    return this;
  }

  addUnknownKeyValToOutput(outputIndex: number, keyVal: KeyValue): this {
    this.data.addUnknownKeyValToOutput(outputIndex, keyVal);
    return this;
  }

  addUnknownKeyValToGlobal(keyVal: KeyValue): this {
    this.data.addUnknownKeyValToGlobal(keyVal);
    return this;
  }

}
