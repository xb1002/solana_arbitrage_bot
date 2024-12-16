import { createJupiterApiClient, SwapRequest, Instruction, DefaultApi,
    QuoteGetRequest,QuoteGetSwapModeEnum,
    QuoteResponseFromJSON
 } from '@jup-ag/api';
import { LAMPORTS_PER_SOL, Keypair, Connection,Transaction,
    SystemProgram, PublicKey, TransactionInstruction,ComputeBudgetProgram,
    TransactionMessage, VersionedTransaction,AddressLookupTableAccount,
    clusterApiUrl
 } from '@solana/web3.js';
import 'dotenv/config';
import bs58 from 'bs58';
import axios from 'axios';
import { wait, instructionFormat } from './lib.js';
import fs from 'fs';

// 导入环境变量
const QUICKNODE_RPC = process.env.QUICKNODE_API;
const SECRET_KEY = process.env.SECRET_KEY;

// 预设
const status = 'confirmed';
const feePayer = Keypair.fromSecretKey(new Uint8Array(bs58.decode(SECRET_KEY as string)));
let tips = 0.00001;  // 0.00001 SOL
let trade_sol = 0.005;  // 0.005 SOL

// 构造RPC池
const rpc : string[] = [QUICKNODE_RPC as string, clusterApiUrl('mainnet-beta')];
// 构造连接池
const cons : Connection[] = rpc.map((rpcUrl) => new Connection(rpcUrl, 'confirmed'));

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

// 监测套利机会
interface monitorParams {
    pair1:string,
    pair2:string,
    con:Connection,
    jupCon:DefaultApi
}
async function monitor(monitorParams:monitorParams) {
    const {pair1,pair2,con,jupCon} = monitorParams;
    let start = new Date().getTime();
    // 获取交易对信息
    const pair1_to_pair2 : QuoteGetRequest = {
        inputMint: pair1,
        outputMint: pair2,
        amount: LAMPORTS_PER_SOL*trade_sol,
        onlyDirectRoutes: false,
        slippageBps: 20,
        maxAccounts: 30,
        swapMode: QuoteGetSwapModeEnum.ExactIn
    }
    const pair2_to_pair1 : QuoteGetRequest = {
        inputMint: pair2,
        outputMint: pair1,
        amount: LAMPORTS_PER_SOL*trade_sol,
        onlyDirectRoutes: false,
        slippageBps: 20,
        // maxAccounts: 30,
        swapMode: QuoteGetSwapModeEnum.ExactOut
    }
    
    try {
        const [quote0Resp,quote1Resp] = await Promise.all([
            getQuote(pair1_to_pair2,jupCon,"pair1_to_pair2"),
            getQuote(pair2_to_pair1,jupCon,"pair2_to_pair1")
        ])
        let p1 = Number(quote0Resp?.outAmount)/Number(quote0Resp?.inAmount);
        let p2 = Number(quote1Resp?.inAmount)/Number(quote1Resp?.outAmount);
        if (p2/p1 > 1.01) {
            console.log(`pair1_to_pair2: ${p1}`)
            console.log(`pair2_to_pair1: ${p2}`)
            console.log(`pair2_to_pair1/pair1_to_pair2: ${p2/p1}`)
            console.log(quote0Resp)
            console.log(quote1Resp)
            process.exit(0);
        }
    } catch (err) {
        console.error(`getQuote error:`)
    }
}


// 主函数
let waitTime = 1; // 1s
async function main() {
    // 监测套利机会
    await monitor({
        pair1:"So11111111111111111111111111111111111111112",
        pair2:"H33XL6HHDReCVRgSApZpsXM7Hy7JGyLztRJaGxjapump",
        con:cons[0],
        jupCon:jupCons[0]
    })

    console.log(`waiting for ${waitTime}s...`)
    await wait(waitTime*1000);
    console.log('start next round...')
    main();
}

main().then(() => {
    console.log('done');
}).catch((err) => {
    console.error(err);
});