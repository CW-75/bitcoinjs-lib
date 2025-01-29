import { Bip32Derivation } from "bip174/src/lib/interfaces";
import { HDSigner, PsbtOpts } from "./types";
import { bitcoin as btcNetwork} from "../networks";

/**
 * These are the default arguments for a Psbt instance.
 */
export const DEFAULT_OPTS: PsbtOpts = {
  /**
   * A bitcoinjs Network object. This is only used if you pass an `address`
   * parameter to addOutput. Otherwise it is not needed and can be left default.
   */
  network: btcNetwork,
  /**
   * When extractTransaction is called, the fee rate is checked.
   * THIS IS NOT TO BE RELIED ON.
   * It is only here as a last ditch effort to prevent sending a 500 BTC fee etc.
   */
  maximumFeeRate: 5000, // satoshi per byte
};


export const bip32DerivationIsMine = (
  root: HDSigner,
): (d: Bip32Derivation) => boolean => {
  return (d: Bip32Derivation): boolean => {
    if (!d.masterFingerprint.equals(root.fingerprint)) return false;
    if (!root.derivePath(d.path).publicKey.equals(d.pubkey)) return false;
    return true;
  };
}
