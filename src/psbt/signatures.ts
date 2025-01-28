import { PartialSig, PsbtInput } from 'bip174/src/lib/interfaces';
import { Transaction } from 'src/transaction';
import * as bscript from 'src/script';

export const checkInputsForPartialSig = (inputs: PsbtInput[], action: string): void => {
  inputs.forEach(input => {
    let throws = false;
    let pSigs: PartialSig[] = [];
    if ((input.partialSig || []).length === 0) {
      if (!input.finalScriptSig && !input.finalScriptWitness) return;
      pSigs = getPsigsFromInputFinalScripts(input);
    } else {
      pSigs = input.partialSig!;
    }
    pSigs.forEach(pSig => {
      const { hashType } = bscript.signature.decode(pSig.signature);
      const whitelist: string[] = [];
      const isAnyoneCanPay = hashType & Transaction.SIGHASH_ANYONECANPAY;
      if (isAnyoneCanPay) whitelist.push('addInput');
      const hashMod = hashType & 0x1f;
      switch (hashMod) {
        case Transaction.SIGHASH_ALL:
          break;
        case Transaction.SIGHASH_SINGLE:
        case Transaction.SIGHASH_NONE:
          whitelist.push('addOutput');
          whitelist.push('setInputSequence');
          break;
      }
      if (whitelist.indexOf(action) === -1) {
        throws = true;
      }
    });
    if (throws) {
      throw new Error('Can not modify transaction, signatures exist.');
    }
  });
}

function getPsigsFromInputFinalScripts(input: PsbtInput): PartialSig[] {
  const scriptItems = !input.finalScriptSig
    ? []
    : bscript.decompile(input.finalScriptSig) || [];
  const witnessItems = !input.finalScriptWitness
    ? []
    : bscript.decompile(input.finalScriptWitness) || [];
  return scriptItems
    .concat(witnessItems)
    .filter(item => {
      return Buffer.isBuffer(item) && bscript.isCanonicalScriptSignature(item);
    })
    .map(sig => ({ signature: sig })) as PartialSig[];
}
