import { PartialSig, PsbtInput } from 'bip174/src/lib/interfaces';
import { Transaction } from '../transaction';
import * as bscript from '../script';
import { fromPublicKey as ecPairFromPublicKey, Signer, SignerAsync } from '../ecpair';
import * as payments from '../payments';
import { checkForInput } from 'bip174/src/lib/utils';
import { HDSigner, HDSignerAsync } from './types';

export const checkInputsForPartialSig = (
  inputs: PsbtInput[],
  action: string,
): void => {
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
};

const getPsigsFromInputFinalScripts = (input: PsbtInput): PartialSig[] => {
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
};

export const hasSigs = (
  neededSigs: number,
  partialSig?: any[],
  pubkeys?: Buffer[],
): boolean => {
  if (!partialSig) return false;
  let sigs: any;
  if (pubkeys) {
    sigs = pubkeys
      .map(pkey => {
        const pubkey = ecPairFromPublicKey(pkey, { compressed: true })
          .publicKey;
        return partialSig.find(pSig => pSig.pubkey.equals(pubkey));
      })
      .filter(v => !!v);
  } else {
    sigs = partialSig;
  }
  if (sigs.length > neededSigs) throw new Error('Too many signatures');
  return sigs.length === neededSigs;
};

export const checkPartialSigSighashes = (input: PsbtInput): void => {
  if (!input.sighashType || !input.partialSig) return;
  const { partialSig, sighashType } = input;
  partialSig.forEach(pSig => {
    const { hashType } = bscript.signature.decode(pSig.signature);
    if (sighashType !== hashType) {
      throw new Error('Signature sighash does not match input sighash type');
    }
  });
};

export const sighashTypeToString = (sighashType: number): string => {
  let text =
    sighashType & Transaction.SIGHASH_ANYONECANPAY
      ? 'SIGHASH_ANYONECANPAY | '
      : '';
  const sigMod = sighashType & 0x1f;
  switch (sigMod) {
    case Transaction.SIGHASH_ALL:
      text += 'SIGHASH_ALL';
      break;
    case Transaction.SIGHASH_SINGLE:
      text += 'SIGHASH_SINGLE';
      break;
    case Transaction.SIGHASH_NONE:
      text += 'SIGHASH_NONE';
      break;
  }
  return text;
};

export const getSignersFromHD = (
  inputIndex: number,
  inputs: PsbtInput[],
  hdKeyPair: HDSigner | HDSignerAsync,
): Array<Signer | SignerAsync> => {
  const input = checkForInput(inputs, inputIndex);
  if (!input.bip32Derivation || input.bip32Derivation.length === 0) {
    throw new Error('Need bip32Derivation to sign with HD');
  }
  const myDerivations = input.bip32Derivation
    .map(bipDv => {
      if (bipDv.masterFingerprint.equals(hdKeyPair.fingerprint)) {
        return bipDv;
      } else {
        return;
      }
    })
    .filter(v => !!v);
  if (myDerivations.length === 0) {
    throw new Error(
      'Need one bip32Derivation masterFingerprint to match the HDSigner fingerprint',
    );
  }

  const signers: Array<Signer | SignerAsync> = myDerivations.map(bipDv => {
    const node = hdKeyPair.derivePath(bipDv!.path);
    if (!bipDv!.pubkey.equals(node.publicKey)) {
      throw new Error('pubkey did not match bip32Derivation');
    }
    return node;
  });
  return signers;
}

export const getSortedSigs = (script: Buffer, partialSig: PartialSig[]): Buffer[] => {
  const p2ms = payments.p2ms({ output: script });
  // for each pubkey in order of p2ms script
  return p2ms
    .pubkeys!.map(pk => {
      // filter partialSig array by pubkey being equal
      return (
        partialSig.filter(ps => {
          return ps.pubkey.equals(pk);
        })[0] || {}
      ).signature;
      // Any pubkey without a match will return undefined
      // this last filter removes all the undefined items in the array.
    })
    .filter(v => !!v);
}

export const isSigLike = (buf: Buffer): boolean => {
  return bscript.isCanonicalScriptSignature(buf);
}
