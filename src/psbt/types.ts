import { Network } from 'src/networks';
import { Transaction } from 'src/transaction';
import { Psbt as PsbtBase } from 'bip174';
import { PsbtOutput } from 'bip174/src/lib/interfaces';

export interface PsbtParams {
  opts?: PsbtOptsOptional;
  readonly data: PsbtBase;
}

export interface PsbtCache {
  __NON_WITNESS_UTXO_TX_CACHE: Transaction[];
  __NON_WITNESS_UTXO_BUF_CACHE: Buffer[];
  __TX_IN_CACHE: { [index: string]: number };
  __TX: Transaction;
  __FEE_RATE?: number;
  __FEE?: number;
  __EXTRACTED_TX?: Transaction;
  __UNSAFE_SIGN_NONSEGWIT: boolean;
}

export interface PsbtOpts {
  network: Network;
  maximumFeeRate: number;
}

export interface TransactionInput {
  hash: string | Buffer;
  index: number;
  sequence?: number;
}

export interface TransactionOutput {
  script: Buffer;
  value: bigint;
}

export interface PsbtTxInput extends TransactionInput {
  hash: Buffer;
}

export interface PsbtTxOutput extends TransactionOutput {
  address: string | undefined;
}

export type PsbtOutputExtended = PsbtOutputExtendedAddress | PsbtOutputExtendedScript;

export interface PsbtOutputExtendedAddress extends PsbtOutput {
  address: string;
  value: number;
}

export interface PsbtOutputExtendedScript extends PsbtOutput {
    script: Buffer;
    value: number;
  }

export type PsbtOptsOptional = Partial<PsbtOpts>;
