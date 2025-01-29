import { p2wpkh, p2sh, p2ms, p2pk, p2pkh, p2wsh } from 'src/payments';

function isPaymentFactory(payment: any): (script: Buffer) => boolean {
  return (script: Buffer): boolean => {
    try {
      payment({ output: script });
      return true;
    } catch (err) {
      return false;
    }
  };
}

export const checkInvalidP2WSH = (script: Buffer): void => {
  if (isP2WPKH(script) || isP2SHScript(script)) {
    throw new Error('P2WPKH or P2SH can not be contained within P2WSH');
  }
};

export const isP2MS = isPaymentFactory(p2ms);
export const isP2PK = isPaymentFactory(p2pk);
export const isP2PKH = isPaymentFactory(p2pkh);
export const isP2WPKH = isPaymentFactory(p2wpkh);

// This function is used to check if a script is a P2WSH or P2SH script.
export const isP2WSHScript = isPaymentFactory(p2wsh);
export const isP2SHScript = isPaymentFactory(p2sh);
