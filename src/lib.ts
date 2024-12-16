import { PublicKey, Connection } from '@solana/web3.js';
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


export async function pollTransactionStatus(signature : string, start : number) {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const interval = setInterval(async () => {
      const status = await connection.getSignatureStatus(signature,{
        searchTransactionHistory: true
      });
      if (status && status.value) {
        const err = status.value.err;
        if (err) {
          console.log('Transaction failed with error:', err);
          clearInterval(interval);
        } else {
          console.log('Transaction confirmed with status:', status.value.confirmationStatus);
          clearInterval(interval);
        }
      } else {
        console.log('Transaction still not processed...');
      }
      if (new Date().getTime() - start > 30000) {
        console.log('Timeout reached');
        clearInterval(interval);
      }
    }, 5000);  // 每5秒查询一次
  }