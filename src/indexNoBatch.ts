import { createJupiterApiClient, SwapRequest, Instruction, DefaultApi,
    QuoteGetRequest,QuoteGetSwapModeEnum,
    QuoteResponseFromJSON,
    QuoteResponse
 } from '@jup-ag/api';
import { LAMPORTS_PER_SOL, Keypair, Connection,Transaction,
    SystemProgram, PublicKey, TransactionInstruction,ComputeBudgetProgram,
    TransactionMessage, VersionedTransaction,AddressLookupTableAccount,
    clusterApiUrl
 } from '@solana/web3.js';
import 'dotenv/config';
import bs58 from 'bs58';
import axios from 'axios';
import { wait, instructionFormat, pollTransactionStatus } from './lib.js';
import fs from 'fs';

// 导入环境变量
const QUICKNODE_RPC = process.env.QUICKNODE_API;
const HELIUS_RPC = process.env.HELIUS_API;
const SECRET_KEY = process.env.SECRET_KEY;

// 预设
const status = 'confirmed';
const payer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(SECRET_KEY as string)));
// let tips = 0.00001;  // 0.00001 SOL
let trade_sol = 0.008;  // 单位 SOL
let threshold = 1.008; // 阈值

// 构造RPC池
const rpc : string[] = [QUICKNODE_RPC as string, clusterApiUrl('mainnet-beta'), HELIUS_RPC as string];
// 构造连接池
const cons : Connection[] = rpc.map((rpcUrl) => new Connection(rpcUrl, status));

// 构造JUPITER RPC池
const jupRpc = ["https://public.jupiterapi.com","https://quote-api.jup.ag/v6"]
// 构造JUPITER连接池
const jupCons : DefaultApi[] = jupRpc.map((rpcUrl) => createJupiterApiClient({basePath: rpcUrl}));

// 自定义函数
async function getQuote(quoteParams:QuoteGetRequest,jupCon:DefaultApi,name:string) {
    let start = new Date().getTime();
    try {
        const quoteResp = await jupCon.quoteGet(quoteParams)
        // console.log(quoteResp)
        // console.log(`getQuote time cost:`,new Date().getTime()-start)
        console.log(`${name} getQuote time cost:`,new Date().getTime()-start)
        return quoteResp;
    } catch (err) {
        console.error(`${name} getQuote error:`)
    }
}

// 发送交易
async function sendTxToCons(tx:VersionedTransaction) {
    try {
        cons.map(async (con) => {
            const signature = await con.sendTransaction(tx, {
                skipPreflight: true,
                maxRetries: 0,
            }).then((signature) => {
                console.log(`tx sent: ${signature}`)
            }).catch((err) => {
                console.error(`sendTransaction error:`)
                console.error(err)
            })
        })
    } catch (err) {
        console.error(`sendTxToCons error:`)
    }
}

// 每20s更新一次blockhash
var blockhash = (await cons[1].getLatestBlockhash()).blockhash;
setInterval(async () => {
    try {
        blockhash = (await cons[1].getLatestBlockhash()).blockhash;
    } catch (err) {
        console.error(`getLatestBlockhash error:`)
    }
}, 20000);

// 监测套利机会
interface monitorParams {
    pair1:string,
    pair2:string,
    con:Connection,
    jupCon:DefaultApi
}
async function monitor(monitorParams:monitorParams) {
    const {pair1,pair2,con,jupCon} = monitorParams;
    // 获取交易对信息
    try {
        const pair1_to_pair2 : QuoteGetRequest = {
            inputMint: pair1,
            outputMint: pair2,
            amount: LAMPORTS_PER_SOL*trade_sol,
            onlyDirectRoutes: false,
            slippageBps: 0,
            maxAccounts: 30,
            swapMode: QuoteGetSwapModeEnum.ExactIn
        }
        let quote0Resp = await getQuote(pair1_to_pair2,jupCon,"pair1_to_pair2")
        const pair2_to_pair1 : QuoteGetRequest = {
            inputMint: pair2,
            outputMint: pair1,
            amount: Number((quote0Resp as QuoteResponse).outAmount),
            onlyDirectRoutes: false,
            slippageBps: 0,
            maxAccounts: 30,
            swapMode: QuoteGetSwapModeEnum.ExactIn
        }
        let quote1Resp = await getQuote(pair2_to_pair1,jupCon,"pair2_to_pair1")
        let p1 = Number(quote0Resp?.outAmount)/Number(quote0Resp?.inAmount);
        let p2 = Number(quote1Resp?.inAmount)/Number(quote1Resp?.outAmount);
        if (p2/p1 > threshold) {
            console.log(`pair1_to_pair2: ${p1}`)
            console.log(`pair2_to_pair1: ${p2}`)
            console.log(`pair2_to_pair1/pair1_to_pair2: ${p2/p1}`)
            // console.log(quote0Resp)
            // console.log(quote1Resp)
            // process.exit(0);

            let mergedQuoteResp = quote0Resp as QuoteResponse;
            mergedQuoteResp.outputMint = (quote1Resp as QuoteResponse).outputMint;
            mergedQuoteResp.outAmount = String(pair1_to_pair2.amount);
            mergedQuoteResp.otherAmountThreshold = String(pair1_to_pair2.amount);
            mergedQuoteResp.priceImpactPct = "0";
            mergedQuoteResp.routePlan = mergedQuoteResp.routePlan.concat((quote1Resp as QuoteResponse).routePlan);

            let swapData : SwapRequest = {
                "userPublicKey": payer.publicKey.toBase58(),
                "wrapAndUnwrapSol": false,
                "useSharedAccounts": false,
                "skipUserAccountsRpcCalls": true,
                "quoteResponse": mergedQuoteResp,
              }
            try {
                let start = new Date().getTime();
                let instructions = await jupCon.swapInstructionsPost({ swapRequest: swapData })
                console.log(`swapInstructionsPost time cost:`,new Date().getTime()-start)
                // console.log(instructions)
                // process.exit(0);

                // build instructions
                let ixs : TransactionInstruction[] = [];
                let cu_num = 300000;
                // 1. setup instructions
                const setupInstructions = instructions.setupInstructions.map(instructionFormat);
                ixs = ixs.concat(setupInstructions);

                // 2. swap instructions
                const swapInstructions = instructionFormat(instructions.swapInstruction);
                ixs.push(swapInstructions);

                // 3. 调用computeBudget设置cu
                const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                    units: cu_num,
                })
                ixs.push(computeUnitLimitInstruction);

                // 4. 调用computeBudget设置优先费
                const computeUnitPriceInstruction = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: 200,
                })
                ixs.push(computeUnitPriceInstruction);


                // ALT
                const addressLookupTableAccounts = await Promise.all(
                    instructions.addressLookupTableAddresses.map(async (address) => {
                        const result = await con.getAddressLookupTable(new PublicKey(address));
                        return result.value as AddressLookupTableAccount;
                    })
                );

                // v0 tx
                // const { blockhash } = await con.getLatestBlockhash();
                const messageV0 = new TransactionMessage({
                    payerKey: payer.publicKey,
                    recentBlockhash: blockhash,
                    instructions: ixs,
                }).compileToV0Message(addressLookupTableAccounts);
                const transaction = new VersionedTransaction(messageV0);
                transaction.sign([payer]);

                console.log('generate tx cost:',new Date().getTime()-start)
                // send tx
                try {
                    await sendTxToCons(transaction);
                    console.log('from generate to send tx cost:',new Date().getTime()-start)
                } catch (err) {
                    console.error(`sendTxToCons error:`)
                } 
            } catch (err) {
                console.error(`swapInstructionsPost error:`)
            }
        } 
    } catch (err) {
        console.error(`getQuote error:`)
    }
}


// 主函数
let waitTime = 3; // 1s
let pair1 = "So11111111111111111111111111111111111111112"
let pair2s = [
    "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    "61V8vBaqAGMpgDQi4JcAwo1dmBGHsyhzodcPqnEVpump",
    "5voS9evDjxF589WuEub5i4ti7FWQmZCsAsyD5ucbuRqM",
    "42PZx7bPF1EMnP9L7vcjihTx7Nryxh81GG9Xs6fdpump",
    "892DtJWGTgidC9uX4kPtWq5FXxaYgg8CBjhphtUwpump"
]
let num = 0;
async function main(num:number) {
    // 监测套利机会
    await monitor({
        pair1:pair1,
        pair2:pair2s[num],
        con:cons[0],
        jupCon:jupCons[0]
    })

    console.log(`waiting for ${waitTime}s...`)
    await wait(waitTime*1000);
    main((num+1)%pair2s.length);
}

main(num).then(() => {
    console.log('start next round...')
}).catch((err) => {
    console.error(err);
});