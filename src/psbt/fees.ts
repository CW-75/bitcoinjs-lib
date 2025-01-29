import { Psbt } from "./psbt";
import { PsbtCache, PsbtOpts } from "./types";

export const checkFees = (psbt: Psbt, cache: PsbtCache, opts?: PsbtOpts): void => {
    const feeRate = cache.__FEE_RATE || psbt.getFeeRate();
    const vsize = cache.__EXTRACTED_TX!.virtualSize();
    const satoshis = feeRate * vsize;
    if (opts && feeRate >= opts.maximumFeeRate) {
      throw new Error(
        `Warning: You are paying around ${(satoshis / 1e8).toFixed(8)} in ` +
          `fees, which is ${feeRate} satoshi per byte for a transaction ` +
          `with a VSize of ${vsize} bytes (segwit counted as 0.25 byte per ` +
          `byte). Use setMaximumFeeRate method to raise your threshold, or ` +
          `pass true to the first arg of extractTransaction.`,
      );
    }
  }