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
import { wait, instructionFormat } from './lib';
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
    try {
        const quote0Resp = await jupCon.quoteGet(pair1_to_pair2)
        console.log(quote0Resp)
        console.log("time cost:",new Date().getTime()-start)
    } catch (err) {
        console.error('get pair1_to_pair2 error:')
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
    try{
        const quote1Resp = await jupCon.quoteGet(pair2_to_pair1)
        console.log(quote1Resp)
        console.log("time cost:",new Date().getTime()-start)
    } catch (err) {
        console.error('get pair2_to_pair1 error:')
    }
}


// 主函数
async function main() {
    // 监测套利机会
    monitor({
        pair1:"So11111111111111111111111111111111111111112",
        pair2:"H33XL6HHDReCVRgSApZpsXM7Hy7JGyLztRJaGxjapump",
        con:cons[0],
        jupCon:jupCons[0]
    })
}

main().then(() => {
    console.log('done');
}).catch((err) => {
    console.error(err);
});