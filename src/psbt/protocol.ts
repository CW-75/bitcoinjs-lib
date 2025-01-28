import { p2wpkh, p2sh } from 'src/payments';

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

export const isP2WPKH = isPaymentFactory(p2wpkh);

// Script protocol
export const isP2SHScript = isPaymentFactory(p2sh);

export const checkInvalidP2WSH = (script: Buffer): void => {
  if (isP2WPKH(script) || isP2SHScript(script)) {
    throw new Error('P2WPKH or P2SH can not be contained within P2WSH');
  }
};
