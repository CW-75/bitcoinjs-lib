import { PsbtInput, PsbtOutput } from 'bip174/src/lib/interfaces';
import { PsbtCache } from './types';
import { getMeaningfulScript, getScriptFromUtxo } from './script';
import { hash160 } from 'src/crypto';
import * as bscript from 'src/script';

export const pubkeyInScript = (pubkey: Buffer, script: Buffer): boolean => {
  const pubkeyHash = hash160(pubkey);

  const decompiled = bscript.decompile(script);
  if (decompiled === null) throw new Error('Unknown script error');

  return decompiled.some(element => {
    if (typeof element === 'number') return false;
    return element.equals(pubkey) || element.equals(pubkeyHash);
  });
};


export const pubkeyInInput = (
    pubkey: Buffer,
    input: PsbtInput,
    inputIndex: number,
    cache: PsbtCache,
  ): boolean => {
    const script = getScriptFromUtxo(inputIndex, input, cache);
    const { meaningfulScript } = getMeaningfulScript(
      script,
      inputIndex,
      'input',
      input.redeemScript,
      input.witnessScript,
    );
    return pubkeyInScript(pubkey, meaningfulScript);
  }
  
export const pubkeyInOutput = (
  pubkey: Buffer,
  output: PsbtOutput,
  outputIndex: number,
  cache: PsbtCache,
): boolean => {
  const script = cache.__TX.outs[outputIndex].script;
  const { meaningfulScript } = getMeaningfulScript(
    script,
    outputIndex,
    'output',
    output.redeemScript,
    output.witnessScript,
  );
  return pubkeyInScript(pubkey, meaningfulScript);
};

