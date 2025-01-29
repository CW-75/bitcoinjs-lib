import { PartialSig, PsbtInput } from 'bip174/src/lib/interfaces';
import { hasSigs, isSigLike } from './signatures';
import { payments } from '../';
import {
  checkInvalidP2WSH,
  isP2MS,
  isP2PK,
  isP2PKH,
  isP2SHScript,
  isP2WPKH,
  isP2WSHScript,
} from './protocol';
import { GetScriptReturn, PsbtCache, ScriptType } from './types';
import { nonWitnessUtxoTxFromCache } from './transaction';
import { isPubkeyLike, pubkeyInScript } from './pubkey';
import * as varuint from 'bip174/src/lib/converter/varint';
import * as bscript from '../script';
import { getPayment } from './payments';

export const canFinalize = (
  input: PsbtInput,
  script: Buffer,
  scriptType: string,
): boolean => {
  switch (scriptType) {
    case 'pubkey':
    case 'pubkeyhash':
    case 'witnesspubkeyhash':
      return hasSigs(1, input.partialSig);
    case 'multisig':
      const p2ms = payments.p2ms({ output: script });
      return hasSigs(p2ms.m!, input.partialSig, p2ms.pubkeys);
    default:
      return false;
  }
};

export const isFinalized = (input: PsbtInput): boolean => {
  return !!input.finalScriptSig || !!input.finalScriptWitness;
};

export const checkScriptForPubkey = (
  pubkey: Buffer,
  script: Buffer,
  action: string,
): void => {
  if (!pubkeyInScript(pubkey, script)) {
    throw new Error(
      `Can not ${action} for this input with the key ${pubkey.toString('hex')}`,
    );
  }
};

export const getMeaningfulScript = (
  script: Buffer,
  index: number,
  ioType: 'input' | 'output',
  redeemScript?: Buffer,
  witnessScript?: Buffer,
): {
  meaningfulScript: Buffer;
  type: 'p2sh' | 'p2wsh' | 'p2sh-p2wsh' | 'raw';
} => {
  const isP2SH = isP2SHScript(script);
  const isP2SHP2WSH = isP2SH && redeemScript && isP2WSHScript(redeemScript);
  const isP2WSH = isP2WSHScript(script);

  if (isP2SH && redeemScript === undefined)
    throw new Error('scriptPubkey is P2SH but redeemScript missing');
  if ((isP2WSH || isP2SHP2WSH) && witnessScript === undefined)
    throw new Error(
      'scriptPubkey or redeemScript is P2WSH but witnessScript missing',
    );

  let meaningfulScript: Buffer;

  if (isP2SHP2WSH) {
    meaningfulScript = witnessScript!;
    checkRedeemScript(index, script, redeemScript!, ioType);
    checkWitnessScript(index, redeemScript!, witnessScript!, ioType);
    checkInvalidP2WSH(meaningfulScript);
  } else if (isP2WSH) {
    meaningfulScript = witnessScript!;
    checkWitnessScript(index, script, witnessScript!, ioType);
    checkInvalidP2WSH(meaningfulScript);
  } else if (isP2SH) {
    meaningfulScript = redeemScript!;
    checkRedeemScript(index, script, redeemScript!, ioType);
  } else {
    meaningfulScript = script;
  }
  return {
    meaningfulScript,
    type: isP2SHP2WSH
      ? 'p2sh-p2wsh'
      : isP2SH
      ? 'p2sh'
      : isP2WSH
      ? 'p2wsh'
      : 'raw',
  };
};

export const scriptWitnessToWitnessStack = (buffer: Buffer): Buffer[] => {
  let offset = 0;

  function readSlice(n: number): Buffer {
    offset += n;
    return buffer.slice(offset - n, offset);
  }

  function readVarInt(): number {
    const vi = varuint.decode(buffer, offset);
    offset += (varuint.decode as any).bytes;
    return vi;
  }

  function readVarSlice(): Buffer {
    return readSlice(readVarInt());
  }

  function readVector(): Buffer[] {
    const count = readVarInt();
    const vector: Buffer[] = [];
    for (let i = 0; i < count; i++) vector.push(readVarSlice());
    return vector;
  }

  return readVector();
};

function scriptCheckerFactory(
  payment: any,
  paymentScriptName: string,
): (idx: number, spk: Buffer, rs: Buffer, ioType: 'input' | 'output') => void {
  return (
    inputIndex: number,
    scriptPubKey: Buffer,
    redeemScript: Buffer,
    ioType: 'input' | 'output',
  ): void => {
    const redeemScriptOutput = payment({
      redeem: { output: redeemScript },
    }).output as Buffer;

    if (!scriptPubKey.equals(redeemScriptOutput)) {
      throw new Error(
        `${paymentScriptName} for ${ioType} #${inputIndex} doesn't match the scriptPubKey in the prevout`,
      );
    }
  };
}

export const classifyScript = (script: Buffer): ScriptType => {
  if (isP2WPKH(script)) return 'witnesspubkeyhash';
  if (isP2PKH(script)) return 'pubkeyhash';
  if (isP2MS(script)) return 'multisig';
  if (isP2PK(script)) return 'pubkey';
  return 'nonstandard';
};

const checkRedeemScript = scriptCheckerFactory(payments.p2sh, 'Redeem script');
const checkWitnessScript = scriptCheckerFactory(
  payments.p2wsh,
  'Witness script',
);

export const getScriptFromUtxo = (
  inputIndex: number,
  input: PsbtInput,
  cache: PsbtCache,
): Buffer => {
  if (input.witnessUtxo !== undefined) {
    return input.witnessUtxo.script;
  } else if (input.nonWitnessUtxo !== undefined) {
    const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
      cache,
      input,
      inputIndex,
    );
    return nonWitnessUtxoTx.outs[cache.__TX.ins[inputIndex].index].script;
  } else {
    throw new Error("Can't find pubkey in input without Utxo data");
  }
};

export const getScriptFromInput = (
  inputIndex: number,
  input: PsbtInput,
  cache: PsbtCache,
): GetScriptReturn => {
  const unsignedTx = cache.__TX;
  const res: GetScriptReturn = {
    script: null,
    isSegwit: false,
    isP2SH: false,
    isP2WSH: false,
  };
  res.isP2SH = !!input.redeemScript;
  res.isP2WSH = !!input.witnessScript;
  if (input.witnessScript) {
    res.script = input.witnessScript;
  } else if (input.redeemScript) {
    res.script = input.redeemScript;
  } else {
    if (input.nonWitnessUtxo) {
      const nonWitnessUtxoTx = nonWitnessUtxoTxFromCache(
        cache,
        input,
        inputIndex,
      );
      const prevoutIndex = unsignedTx.ins[inputIndex].index;
      res.script = nonWitnessUtxoTx.outs[prevoutIndex].script;
    } else if (input.witnessUtxo) {
      res.script = input.witnessUtxo.script;
    }
  }
  if (input.witnessScript || isP2WPKH(res.script!)) {
    res.isSegwit = true;
  }
  return res;
};

export const witnessStackToScriptWitness = (witness: Buffer[]): Buffer => {
  let buffer = Buffer.allocUnsafe(0);

  function writeSlice(slice: Buffer): void {
    buffer = Buffer.concat([buffer, Buffer.from(slice)]);
  }

  function writeVarInt(i: number): void {
    const currentLen = buffer.length;
    const varintLen = varuint.encodingLength(i);

    buffer = Buffer.concat([buffer, Buffer.allocUnsafe(varintLen)]);
    varuint.encode(i, buffer, currentLen);
  }

  function writeVarSlice(slice: Buffer): void {
    writeVarInt(slice.length);
    writeSlice(slice);
  }

  function writeVector(vector: Buffer[]): void {
    writeVarInt(vector.length);
    vector.forEach(writeVarSlice);
  }

  writeVector(witness);

  return buffer;
};

export const redeemFromFinalScriptSig = (
  finalScript: Buffer | undefined,
): Buffer | undefined => {
  if (!finalScript) return;
  const decomp = bscript.decompile(finalScript);
  if (!decomp) return;
  const lastItem = decomp[decomp.length - 1];
  if (
    !Buffer.isBuffer(lastItem) ||
    isPubkeyLike(lastItem) ||
    isSigLike(lastItem)
  )
    return;
  const sDecomp = bscript.decompile(lastItem);
  if (!sDecomp) return;
  return lastItem;
};

export const redeemFromFinalWitnessScript = (
  finalScript: Buffer | undefined,
): Buffer | undefined  => {
  if (!finalScript) return;
  const decomp = scriptWitnessToWitnessStack(finalScript);
  const lastItem = decomp[decomp.length - 1];
  if (isPubkeyLike(lastItem)) return;
  const sDecomp = bscript.decompile(lastItem);
  if (!sDecomp) return;
  return lastItem;
}

export const  getFinalScripts =(
    inputIndex: number,
    input: PsbtInput,
    script: Buffer,
    isSegwit: boolean,
    isP2SH: boolean,
    isP2WSH: boolean,
  ): {
    finalScriptSig: Buffer | undefined;
    finalScriptWitness: Buffer | undefined;
  } => {
    const scriptType = classifyScript(script);
    if (!canFinalize(input, script, scriptType))
      throw new Error(`Can not finalize input #${inputIndex}`);
    return prepareFinalScripts(
      script,
      scriptType,
      input.partialSig!,
      isSegwit,
      isP2SH,
      isP2WSH,
    );
  }
  
  function prepareFinalScripts(
    script: Buffer,
    scriptType: string,
    partialSig: PartialSig[],
    isSegwit: boolean,
    isP2SH: boolean,
    isP2WSH: boolean,
  ): {
    finalScriptSig: Buffer | undefined;
    finalScriptWitness: Buffer | undefined;
  } {
    let finalScriptSig: Buffer | undefined;
    let finalScriptWitness: Buffer | undefined;
  
    // Wow, the payments API is very handy
    const payment: payments.Payment = getPayment(script, scriptType, partialSig);
    const p2wsh = !isP2WSH ? null : payments.p2wsh({ redeem: payment });
    const p2sh = !isP2SH ? null : payments.p2sh({ redeem: p2wsh || payment });
  
    if (isSegwit) {
      if (p2wsh) {
        finalScriptWitness = witnessStackToScriptWitness(p2wsh.witness!);
      } else {
        finalScriptWitness = witnessStackToScriptWitness(payment.witness!);
      }
      if (p2sh) {
        finalScriptSig = p2sh.input;
      }
    } else {
      if (p2sh) {
        finalScriptSig = p2sh.input;
      } else {
        finalScriptSig = payment.input;
      }
    }
    return {
      finalScriptSig,
      finalScriptWitness,
    };
  }