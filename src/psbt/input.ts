import { PsbtInput } from 'bip174/src/lib/interfaces';
import { Output, Transaction } from 'src/transaction';
import { PsbtCache } from './types';
import { nonWitnessUtxoTxFromCache } from './transaction';
import { scriptWitnessToWitnessStack } from './script';


export const inputFinalizeGetAmts = (
  inputs: PsbtInput[],
  tx: Transaction,
  cache: PsbtCache,
  mustFinalize: boolean,
): void => {
  let inputAmount = 0;
  inputs.forEach((input, idx) => {
    if (mustFinalize && input.finalScriptSig)
      tx.ins[idx].script = input.finalScriptSig;
    if (mustFinalize && input.finalScriptWitness) {
      tx.ins[idx].witness = scriptWitnessToWitnessStack(
        input.finalScriptWitness,
      );
    }
    if (input.witnessUtxo) {
      inputAmount += input.witnessUtxo.value;
    } else if (input.nonWitnessUtxo) {
      const nwTx = nonWitnessUtxoTxFromCache(cache, input, idx);
      const vout = tx.ins[idx].index;
      const out = nwTx.outs[vout] as Output;
      inputAmount += out.value;
    }
  });
  const outputAmount = (tx.outs as Output[]).reduce(
    (total, o) => total + o.value,
    0,
  );
  const fee = inputAmount - outputAmount;
  if (fee < 0) {
    throw new Error('Outputs are spending more than Inputs');
  }
  const bytes = tx.virtualSize();
  cache.__FEE = fee;
  cache.__EXTRACTED_TX = tx;
  cache.__FEE_RATE = Math.floor(fee / bytes);
};
