import { PsbtInputExtended } from 'bip174/src/lib/interfaces';
import { PsbtActions } from './actions';
import { checkTxForDupeIns, transactionFromBuffer } from './transaction';
import { PsbtOptsOptional } from './types';
import { Psbt as PsbtBase } from 'bip66';

interface IPsbtCoreUpdates {
  setLocktime(locktime: number): Psbt;
  setVersion(version: number): Psbt;
}

interface IPsbtActions {
  addInput(inputData: PsbtInputExtended): Psbt;
}

class Psbt extends PsbtActions implements IPsbtActions, IPsbtCoreUpdates {
  /**
   * Get a Psbt transaction from base64 tx string
   * @param data tx string in formt Base64
   * @param opts PsbtOptsOptional -> {network, maximumFeeRate}
   * @returns
   */
  static fromBase64(data: string, opts?: PsbtOptsOptional): Psbt {
    const buffer = Buffer.from(data, 'base64');
    return this.fromBuffer(buffer, opts);
  }

  /**
   *
   * @param data
   * @param opts
   * @returns
   */
  static fromHex(data: string, opts?: PsbtOptsOptional): Psbt {
    const buffer = Buffer.from(data, 'hex');
    return this.fromBuffer(buffer, opts);
  }

  static fromBuffer(buffer: Buffer, opts: PsbtOptsOptional = {}): Psbt {
    const psbtBase = PsbtBase.fromBuffer(buffer, transactionFromBuffer);
    const psbt = new Psbt({ opts, data: psbtBase });
    checkTxForDupeIns(psbt.__CACHE.__TX, psbt.__CACHE);
    return psbt;
  }

  combine(...those: Psbt[]): Psbt {
    this.data.combine(...those.map(o => o.data));
    return this;
  }

  clone(): Psbt {
    // TODO: more efficient cloning
    const res = Psbt.fromBuffer(this.data.toBuffer());
    res.opts = JSON.parse(JSON.stringify(this.opts));
    return res;
  }
}

export { Psbt };
