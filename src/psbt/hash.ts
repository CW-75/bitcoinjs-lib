import { checkForInput } from "bip174/src/lib/utils";
import { checkScriptForPubkey, getMeaningfulScript } from "./script";
import { PsbtCache } from "./types";
import { PsbtInput } from "bip174/src/lib/interfaces";
import { Output, Transaction } from "../transaction";
import { sighashTypeToString } from "./signatures";
import { nonWitnessUtxoTxFromCache } from "./transaction";
import { isP2WPKH } from "./protocol";
import * as payments from '../payments'

export const getHashAndSighashType = (
    inputs: PsbtInput[],
    inputIndex: number,
    pubkey: Buffer,
    cache: PsbtCache,
    sighashTypes: number[],
  ): {
    hash: Buffer;
    sighashType: number;
  } => {
    const input = checkForInput(inputs, inputIndex);
    const { hash, sighashType, script } = getHashForSig(
      inputIndex,
      input,
      cache,
      false,
      sighashTypes,
    );
    checkScriptForPubkey(pubkey, script, 'sign');
    return {
      hash,
      sighashType,
    };
  }
  
  export const getHashForSig = (
    inputIndex: number,
    input: PsbtInput,
    cache: PsbtCache,
    forValidate: boolean,
    sighashTypes?: number[],
  ): {
    script: Buffer;
    hash: Buffer;
    sighashType: number;
  } => {
    const unsignedTx = cache.__TX;
    const sighashType = input.sighashType || Transaction.SIGHASH_ALL;
    if (sighashTypes && sighashTypes.indexOf(sighashType) < 0 && !sighashTypes?.find((sighash) => sighash > 0x40 && sighash <= 0x43)) {
      const str = sighashTypeToString(sighashType);
      throw new Error(
        `Sighash type is not allowed. Retry the sign method passing the ` +
          `sighashTypes array of whitelisted types. Sighash type: ${str}`,
      );
    }
    let hash: Buffer;
    let prevout: Output;
    if (input.nonWitnessUtxo) {
      const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
        cache,
        input,
        inputIndex,
      );
  
      const prevoutHash = unsignedTx.ins[inputIndex].hash;
      const utxoHash = nonWitnessUtxoTx.getHash();
  
      // If a non-witness UTXO is provided, its hash must match the hash specified in the prevout
      if (!prevoutHash.equals(utxoHash)) {
        throw new Error(
          `Non-witness UTXO hash for input #${inputIndex} doesn't match the hash specified in the prevout`,
        );
      }
  
      const prevoutIndex = unsignedTx.ins[inputIndex].index;
      prevout = nonWitnessUtxoTx.outs[prevoutIndex] as Output;
    } else if (input.witnessUtxo) {
      prevout = input.witnessUtxo;
    } else {
      throw new Error('Need a Utxo input item for signing');
    }
    const { meaningfulScript, type } = getMeaningfulScript(
      prevout.script,
      inputIndex,
      'input',
      input.redeemScript,
      input.witnessScript,
    );
  
    if (['p2sh-p2wsh', 'p2wsh'].indexOf(type) >= 0) {
      hash = unsignedTx.hashForWitnessV0(
        inputIndex,
        meaningfulScript,
        prevout.value,
        sighashType,
      );
    } else if (isP2WPKH(meaningfulScript)) {
      // P2WPKH uses the P2PKH template for prevoutScript when signing
      const signingScript = payments.p2pkh({ hash: meaningfulScript.slice(2) })
        .output!;
      hash = unsignedTx.hashForWitnessV0(
        inputIndex,
        signingScript,
        prevout.value,
        sighashType,
      );
    } else {
      // non-segwit
      if (
        input.nonWitnessUtxo === undefined &&
        cache.__UNSAFE_SIGN_NONSEGWIT === false
      )
        throw new Error(
          `Input #${inputIndex} has witnessUtxo but non-segwit script: ` +
            `${meaningfulScript.toString('hex')}`,
        );
      if (!forValidate && cache.__UNSAFE_SIGN_NONSEGWIT !== false)
        console.warn(
          'Warning: Signing non-segwit inputs without the full parent transaction ' +
            'means there is a chance that a miner could feed you incorrect information ' +
            'to trick you into paying large fees. This behavior is the same as the old ' +
            'TransactionBuilder class when signing non-segwit scripts. You are not ' +
            'able to export this Psbt with toBuffer|toBase64|toHex since it is not ' +
            'BIP174 compliant.\n*********************\nPROCEED WITH CAUTION!\n' +
            '*********************',
        );
      hash = unsignedTx.hashForSignatureV2(
        inputIndex,
        meaningfulScript,
        prevout.value,
        sighashType,
      );
    }
  
    return {
      script: meaningfulScript,
      sighashType,
      hash,
    };
  }