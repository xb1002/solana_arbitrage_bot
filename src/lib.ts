import { PublicKey } from '@solana/web3.js';
import { Instruction } from '@jup-ag/api';

export function instructionFormat(instruction : Instruction) {
    return {
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((account) => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: account.isSigner,
            isWritable: account.isWritable
        })),
        data: Buffer.from(instruction.data, 'base64')
    };
  }

export async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}