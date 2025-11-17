import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const targetNetworks = getTargetNetworks();

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

export const createWagmiClient = ({ chain }: { chain: Chain }) => {
  // Use viem's default RPC URLs (chain.rpcUrls.default.http)
  // Create fallback transport with default RPC URLs
  const defaultRpcUrls = chain.rpcUrls?.default?.http || [];
  const rpcFallbacks = defaultRpcUrls.length > 0 ? defaultRpcUrls.map(url => http(url)) : [http()];

  return createClient({
    chain: {
      ...chain,
      id: chain.id,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: chain.rpcUrls,
    },
    transport: fallback(rpcFallbacks),
    ...(chain.id !== (hardhat as Chain).id
      ? {
          pollingInterval: scaffoldConfig.pollingInterval,
        }
      : {}),
  });
};

export const baseWagmiConfig = createConfig({
  chains: enabledChains as [Chain, ...Chain[]],
  connectors: wagmiConnectors,
  ssr: true,
  client: createWagmiClient,
});
