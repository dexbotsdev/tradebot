import {
  ChainId,
  WNATIVE,
  Token,
  TokenAmount,
  Percent,
} from "@traderjoe-xyz/sdk-core";
import {
  PairV2,
  RouteV2,
  TradeV2,
  TradeOptions,
  LB_ROUTER_V21_ADDRESS,
  jsonAbis,
} from "@traderjoe-xyz/sdk-v2";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  BaseError,
  ContractFunctionRevertedError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import { config } from "dotenv";

config();
const privateKey = process.env.PRIVATE_KEY;
const { LBRouterV21ABI } = jsonAbis;
const CHAIN_ID = ChainId.FUJI;
const router = LB_ROUTER_V21_ADDRESS[CHAIN_ID];
const account = privateKeyToAccount(`0x${privateKey}`);

// initialize tokens
const WAVAX = WNATIVE[CHAIN_ID]; // Token instance of WAVAX
const AVAX = WAVAX[CHAIN_ID]; // Token instance of AVAX
const USDC = new Token(
  CHAIN_ID,
  "0xB6076C93701D6a07266c31066B298AeC6dd65c2d",
  6,
  "USDC",
  "USD Coin"
);

const BASES = [WAVAX, USDC];

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: avalancheFuji,
  transport: http(),
});

// the input token in the trade
const inputToken = USDC;

// the output token in the trade
const outputToken = WAVAX;

// specify whether user gave an exact inputToken or outputToken value for the trade
const isExactIn = true;

// user string input; in this case representing 20 USDC
const typedValueIn = "0.01";

// parse user input into inputToken's decimal precision, which is 6 for USDC
const typedValueInParsed = parseUnits(typedValueIn, inputToken.decimals);

// wrap into TokenAmount
const amountIn = new TokenAmount(inputToken, typedValueInParsed);

// get all [Token, Token] combinations
const allTokenPairs = PairV2.createAllTokenPairs(
  inputToken,
  outputToken,
  BASES
);

// init PairV2 instances for the [Token, Token] pairs
const allPairs = PairV2.initPairs(allTokenPairs);

// generates all possible routes to consider
const allRoutes = RouteV2.createAllRoutes(allPairs, inputToken, outputToken);

const isNativeIn = false; // set to 'true' if swapping from Native; otherwise, 'false'
const isNativeOut = true; // set to 'true' if swapping to Native; otherwise, 'false'

// generates all possible TradeV2 instances
const trades = await TradeV2.getTradesExactIn(
  allRoutes,
  amountIn,
  outputToken,
  isNativeIn,
  isNativeOut,
  publicClient,
  CHAIN_ID
);

// console.log("Router", router);
// chooses the best trade
const bestTrade: TradeV2 = TradeV2.chooseBestTrade(trades, isExactIn);

// print useful information about the trade, such as the quote, executionPrice, fees, etc
console.log(bestTrade.toLog());

// get trade fee information
const { totalFeePct, feeAmountIn } = await bestTrade.getTradeFee();
console.log("Total fees percentage", totalFeePct.toSignificant(6), "%");
console.log(`Fee: ${feeAmountIn.toSignificant(6)} ${feeAmountIn.token.symbol}`);

// set slippage tolerance
const userSlippageTolerance = new Percent("50", "10000"); // 0.5%

// set swap options
const swapOptions: TradeOptions = {
  allowedSlippage: userSlippageTolerance,
  ttl: 3600,
  recipient: account.address,
  feeOnTransfer: false, // or true
};

// generate swap method and parameters for contract call
const {
  methodName, // e.g. swapExactTokensForNATIVE,
  args, // e.g.[amountIn, amountOut, (pairBinSteps, versions, tokenPath) to, deadline]
  value, // e.g. 0x0
} = bestTrade.swapCallParameters(swapOptions);


const { request } = await publicClient.simulateContract({
  address: router,
  abi: LBRouterV21ABI,
  functionName: methodName,
  args: args,
  account,
  value: BigInt(value),
});
const hash = await walletClient.writeContract(request);
console.log(`Transaction sent with hash ${hash}`);