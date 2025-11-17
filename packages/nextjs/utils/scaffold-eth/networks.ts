import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

type ChainAttributes = {
  // color | [lightThemeColor, darkThemeColor]
  color: string | [string, string];
  // Used to fetch price by providing mainnet token address
  // for networks having native currency other than ETH
  nativeCurrencyTokenAddress?: string;
  icon?: string;
  groupSelector?: string;
};

export type ChainWithAttributes = chains.Chain & Partial<ChainAttributes>;

export const NETWORKS_EXTRA_DATA: Record<string, ChainAttributes> = {
  [chains.hardhat.id]: {
    color: "#b8af0c",
    icon: "/hardhat.png",
  },
  [chains.mainnet.id]: {
    color: "#ff8b9e",
    icon: "/mainnet.svg",
  },
  [chains.sepolia.id]: {
    color: ["#5f4bb6", "#87ff65"],
    icon: "/mainnet.svg",
  },
  [chains.gnosis.id]: {
    color: "#48a9a6",
    icon: "/gnosis.svg",
  },
  [chains.polygon.id]: {
    color: "#2bbdf7",
    nativeCurrencyTokenAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    icon: "/polygon.svg",
  },
  [chains.polygonMumbai.id]: {
    color: "#92D9FA",
    nativeCurrencyTokenAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    icon: "/polygon.svg",
  },
  [chains.optimism.id]: {
    color: "#f01a37",
    icon: "/optimism.svg",
  },
  [chains.arbitrum.id]: {
    color: "#28a0f0",
    icon: "/arbitrum.svg",
  },
  [chains.zkSync.id]: {
    color: "#5f4bb6",
    icon: "/zksync.svg",
  },
  [chains.base.id]: {
    color: "#1450EE",
    icon: "/base.svg",
  },
  [chains.baseSepolia.id]: {
    color: "#1450EE",
    icon: "/base.svg",
  },
  [chains.scroll.id]: {
    color: "#fbebd4",
    icon: "/scroll.svg",
  },
  [chains.scrollSepolia.id]: {
    color: "#fbebd4",
    icon: "/scroll.svg",
  },
  [chains.bsc.id]: {
    color: "#f0b90b",
    icon: "/bsc.svg",
  },
};

/**
 * Gives the block explorer transaction URL.
 * Returns empty string if the network is a local chain
 */
export function getBlockExplorerTxLink(chainId: number, txnHash: string) {
  const chainNames = Object.keys(chains);

  const targetChainArr = chainNames.filter(chainName => {
    const wagmiChain = chains[chainName as keyof typeof chains];
    return wagmiChain.id === chainId;
  });

  if (targetChainArr.length === 0) {
    return "";
  }

  const targetChain = targetChainArr[0] as keyof typeof chains;
  const blockExplorerTxURL = chains[targetChain]?.blockExplorers?.default?.url;

  if (!blockExplorerTxURL) {
    return "";
  }

  return `${blockExplorerTxURL}/tx/${txnHash}`;
}

/**
 * Gives the block explorer URL for a given address.
 */
export function getBlockExplorerAddressLink(network: chains.Chain, address: string) {
  const blockExplorerBaseURL = network.blockExplorers?.default?.url;
  if (network.id === chains.hardhat.id) {
    return `/blockexplorer/address/${address}`;
  }

  if (!blockExplorerBaseURL) {
    return "";
  }

  return `${blockExplorerBaseURL}/address/${address}`;
}

/**
 * @returns targetNetworks array containing networks configured in scaffold.config including extra network metadata
 */
export function getTargetNetworks(): ChainWithAttributes[] {
  // Get all chains from viem/chains
  const allChains: ChainWithAttributes[] = Object.values(chains).map(chain => ({
    ...chain,
    ...NETWORKS_EXTRA_DATA[chain.id],
  }));

  return allChains;
}

export function getPopularTargetNetworks(): ChainWithAttributes[] {
  return scaffoldConfig.targetNetworks.map(targetNetwork => ({
    ...targetNetwork,
    ...NETWORKS_EXTRA_DATA[targetNetwork.id],
  }));
}
