import { isZeroAddress } from "./scaffold-eth/common";
import { Abi, Address, Chain, isAddress, toFunctionSelector } from "viem";

type SourcifyContractData = {
  abi: Abi;
  implementation: Address | null;
  deployment?: {
    blockNumber: string;
    txHash: string;
  };
};

export const fetchContractDataFromSourcify = async (
  contractAddress: Address,
  chainId: number,
): Promise<SourcifyContractData> => {
  try {
    // Sourcify API endpoint for fetching contract metadata
    // Fetch both ABI and deployment info in a single request
    const sourcifyUrl = `https://sourcify.dev/server/v2/contract/${chainId}/${contractAddress}?fields=abi,deployment,proxyResolution`;
    const response = await fetch(sourcifyUrl);

    // 404 means contract is not verified, throw error immediately (like Etherscan)
    if (response.status === 404) {
      throw new Error("Contract not verified on Sourcify");
    }

    if (!response.ok) {
      throw new Error(`Sourcify API returned status ${response.status}`);
    }

    const data = await response.json();

    // Check if contract is verified
    // API v2 returns: match/creationMatch/runtimeMatch can be "match", "exact_match", or null
    const isVerified =
      data.match === "match" ||
      data.match === "exact_match" ||
      data.creationMatch === "match" ||
      data.creationMatch === "exact_match" ||
      data.runtimeMatch === "match" ||
      data.runtimeMatch === "exact_match";

    if (!data || !isVerified) {
      const statusInfo = data?.match || data?.creationMatch || data?.runtimeMatch || "missing";
      throw new Error(`Contract not verified on Sourcify (status: ${statusInfo})`);
    }

    // Extract ABI from the response
    let abi: Abi | null = null;
    let implementation: Address | null = null;

    // First, check if ABI is directly in the response (API v2 format)
    if (data.abi && Array.isArray(data.abi)) {
      abi = data.abi;
    } else if (data.abi && typeof data.abi === "string") {
      // If ABI is a string, try to parse it
      try {
        abi = JSON.parse(data.abi);
      } catch (e) {
        // If parsing fails, continue to other methods
      }
    }

    // Extract implementation address from proxyResolution if available
    if (data.proxyResolution?.isProxy && data.proxyResolution?.implementations?.length > 0) {
      const firstImplementation = data.proxyResolution.implementations[0];
      if (firstImplementation?.address && isAddress(firstImplementation.address)) {
        implementation = firstImplementation.address as Address;
      }
    }

    // If not found, look in compilation.stdJsonOutput (API v2 format)
    if (!abi && data.compilation?.stdJsonOutput?.contracts) {
      const contracts = data.compilation.stdJsonOutput.contracts;
      // Try to find ABI in any contract
      for (const contractGroup of Object.values(contracts) as any[]) {
        for (const contract of Object.values(contractGroup) as any[]) {
          if (contract.abi && Array.isArray(contract.abi)) {
            abi = contract.abi;
            break;
          }
        }
        if (abi) break;
      }
    }

    // Fallback: look in metadata if available
    if (!abi && data.metadata) {
      try {
        const metadata = typeof data.metadata === "string" ? JSON.parse(data.metadata) : data.metadata;

        if (metadata.output?.abi && Array.isArray(metadata.output.abi)) {
          abi = metadata.output.abi;
        }
      } catch (parseError) {
        console.error("Error parsing Sourcify metadata:", parseError);
      }
    }

    if (!abi || !Array.isArray(abi) || abi.length === 0) {
      throw new Error("No ABI found in Sourcify response");
    }

    // Extract deployment info if available
    let deployment: { blockNumber: string; txHash: string } | undefined;
    if (data.deployment && data.deployment.transactionHash && data.deployment.blockNumber) {
      deployment = {
        blockNumber: data.deployment.blockNumber,
        txHash: data.deployment.transactionHash,
      };
    }

    // If there's an implementation address (proxy), fetch its ABI instead
    if (implementation && !isZeroAddress(implementation)) {
      try {
        const implementationData = await fetchContractDataFromSourcify(implementation, chainId);

        if (implementationData.abi && Array.isArray(implementationData.abi) && implementationData.abi.length > 0) {
          // Return implementation ABI, but keep deployment info from original contract
          return {
            abi: implementationData.abi,
            implementation,
            deployment,
          };
        } else {
          console.error("Error fetching ABI for implementation from Sourcify: No ABI found");
          // Fall through to return original contract ABI
        }
      } catch (error) {
        console.error("Error fetching ABI for implementation from Sourcify:", error);
        // Fall through to return original contract ABI
      }
    }

    return {
      abi,
      implementation,
      deployment,
    };
  } catch (error) {
    console.error("Error fetching contract data from Sourcify:", error);
    throw error;
  }
};

// Wrapper function for fetching only deployment info
export const fetchContractCreationInfoFromSourcify = async (
  contractAddress: Address,
  chainId: number,
): Promise<{ blockNumber: string; txHash: string }> => {
  const data = await fetchContractDataFromSourcify(contractAddress, chainId);

  if (!data.deployment) {
    throw new Error("Contract deployment info not available on Sourcify");
  }

  return {
    blockNumber: data.deployment.blockNumber,
    txHash: data.deployment.txHash,
  };
};

export const fetchFunctionSignatureFrom4Bytes = async (
  hexSignature: string | string[],
): Promise<string[] | Record<string, string[]>> => {
  try {
    const isBatch = Array.isArray(hexSignature);
    const signatures = isBatch ? hexSignature : [hexSignature];

    if (signatures.length === 0) {
      return isBatch ? {} : [];
    }

    // Use Sourcify's 4bytes API with comma-delimited list for batch, single value for single
    const commaDelimitedHashes = signatures.join(",");
    const response = await fetch(
      `https://api.4byte.sourcify.dev/signature-database/v1/lookup?function=${encodeURIComponent(
        commaDelimitedHashes,
      )}&filter=true`,
    );

    if (!response.ok) {
      throw new Error(`4bytes API returned status ${response.status}`);
    }

    const data = await response.json();

    // Sourcify API returns {ok: true, result: {function: {[hash]: [...]}, event: {...}}}
    // Function results can be null (no matches) or an array of signatures
    if (isBatch) {
      const results: Record<string, string[]> = {};
      // Initialize all results to empty arrays
      for (const hexSig of signatures) {
        results[hexSig] = [];
      }
      // Populate results from API response
      if (data?.ok && data.result?.function) {
        for (const hexSig of signatures) {
          const sigs = data.result.function[hexSig];
          // Returns null for no matches (openchain.xyz compatible), or array of {name, filtered, hasVerifiedContract}
          if (Array.isArray(sigs)) {
            results[hexSig] = sigs.map((sig: any) => sig.name);
          }
        }
      }
      return results;
    } else {
      // Single signature lookup
      if (data?.ok && data.result?.function && data.result.function[hexSignature as string]) {
        const sigs = data.result.function[hexSignature as string];
        // Returns null for no matches (openchain.xyz compatible), or array of {name, filtered, hasVerifiedContract}
        if (Array.isArray(sigs)) {
          return sigs.map((sig: any) => sig.name);
        }
      }
      return [];
    }
  } catch (error) {
    console.error("Error fetching function signature from 4bytes:", error);
    return Array.isArray(hexSignature) ? {} : [];
  }
};

export const fetchEventSignatureFrom4Bytes = async (
  hexSignature: string | string[],
): Promise<string[] | Record<string, string[]>> => {
  try {
    const isBatch = Array.isArray(hexSignature);
    const signatures = isBatch ? hexSignature : [hexSignature];

    if (signatures.length === 0) {
      return isBatch ? {} : [];
    }

    // Use Sourcify's 4bytes API with comma-delimited list for batch, single value for single
    const commaDelimitedHashes = signatures.join(",");
    const response = await fetch(
      `https://api.4byte.sourcify.dev/signature-database/v1/lookup?event=${encodeURIComponent(
        commaDelimitedHashes,
      )}&filter=true`,
    );

    if (!response.ok) {
      throw new Error(`4bytes API returned status ${response.status}`);
    }

    const data = await response.json();

    // Sourcify API returns {ok: true, result: {function: {...}, event: {[hash]: [...]}}}
    // Event results are always arrays (empty array for no matches)
    if (isBatch) {
      const results: Record<string, string[]> = {};
      // Initialize all results to empty arrays
      for (const hexSig of signatures) {
        results[hexSig] = [];
      }
      // Populate results from API response
      if (data?.ok && data.result?.event) {
        for (const hexSig of signatures) {
          const sigs = data.result.event[hexSig];
          if (Array.isArray(sigs)) {
            results[hexSig] = sigs.map((sig: any) => sig.name);
          }
        }
      }
      return results;
    } else {
      // Single signature lookup
      if (data?.ok && data.result?.event && data.result.event[hexSignature as string]) {
        const sigs = data.result.event[hexSignature as string];
        if (Array.isArray(sigs)) {
          return sigs.map((sig: any) => sig.name);
        }
      }
      return [];
    }
  } catch (error) {
    console.error("Error fetching event signature from 4bytes:", error);
    return Array.isArray(hexSignature) ? {} : [];
  }
};

export const enhanceAbiWith4Bytes = async (abi: Abi): Promise<Abi> => {
  const enhancedAbi = [...abi];

  // Collect all function selectors and their indices for batch lookup
  const functionSelectors: Array<{ index: number; selector: string; item: any }> = [];
  const seenFunctionSelectors = new Set<string>();

  // Collect all event hashes and their indices for batch lookup
  const eventHashes: Array<{ index: number; hash: string; item: any }> = [];
  const seenEventHashes = new Set<string>();

  for (let i = 0; i < enhancedAbi.length; i++) {
    const item = enhancedAbi[i];

    if (item.type === "function") {
      try {
        let selector: string | null = null;

        // Check if this is an "Unresolved_<selector>" function from Heimdall
        // Format: "Unresolved_11cc9195" where "11cc9195" is the selector without 0x (8 hex chars = 4 bytes)
        if (item.name && item.name.startsWith("Unresolved_")) {
          const selectorMatch = item.name.match(/^Unresolved_([0-9a-fA-F]{8})$/);
          if (selectorMatch && selectorMatch[1]) {
            // Add 0x prefix to make it a valid hex selector
            selector = `0x${selectorMatch[1]}`;
          }
        }

        // If not an Unresolved function, calculate selector from signature
        if (!selector && item.name && item.inputs) {
          const currentSignature = `${item.name}(${item.inputs.map((input: any) => input.type).join(",")})`;
          selector = toFunctionSelector(currentSignature);
        }

        if (selector) {
          if (!seenFunctionSelectors.has(selector)) {
            seenFunctionSelectors.add(selector);
          }
          functionSelectors.push({ index: i, selector, item });
        }
      } catch (error) {
        // If selector calculation fails, skip this function
      }
    } else if (item.type === "event") {
      try {
        let hash: string | null = null;

        // Check if this is an "Unresolved_<hash>" event from Heimdall
        // Format: "Unresolved_<64-char-hex>" where the hash is the keccak256 hash without 0x (64 hex chars = 32 bytes)
        if (item.name && item.name.startsWith("Unresolved_")) {
          const hashMatch = item.name.match(/^Unresolved_([0-9a-fA-F]{64})$/);
          if (hashMatch && hashMatch[1]) {
            // Add 0x prefix to make it a valid hex hash
            hash = `0x${hashMatch[1]}`;
          }
        }

        // If not an Unresolved event, we could calculate hash from signature
        // For now, only handle Unresolved events
        if (hash) {
          if (!seenEventHashes.has(hash)) {
            seenEventHashes.add(hash);
          }
          eventHashes.push({ index: i, hash, item });
        }
      } catch (error) {
        // If hash extraction fails, skip this event
      }
    }
  }

  // Batch lookup all function signatures in a single API call
  if (functionSelectors.length > 0) {
    try {
      const selectors = Array.from(seenFunctionSelectors);
      const batchResults = (await fetchFunctionSignatureFrom4Bytes(selectors)) as Record<string, string[]>;

      // Process results and update ABI items
      for (const { index, selector, item } of functionSelectors) {
        const signatures = batchResults[selector] || [];

        if (signatures.length > 0) {
          // Use the first (most common) signature
          const matchedSignature = signatures[0];
          const match = matchedSignature.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);

          // Always update if:
          // 1. We found a match AND it's different from current name, OR
          // 2. Current name is an "Unresolved_*" function (from Heimdall decompilation)
          const isUnresolved = item.name && item.name.startsWith("Unresolved_");
          if (match && match[1] && (match[1] !== item.name || isUnresolved)) {
            // Parse the matched signature to potentially update inputs too
            const paramMatch = matchedSignature.match(/\(([^)]*)\)/);
            if (paramMatch) {
              // Update function name with better name from 4bytes
              enhancedAbi[index] = {
                ...item,
                name: match[1],
              };
            }
          }
        }
      }
    } catch (error) {
      // If batch lookup fails, keep original ABI items
      console.error("Error in batch 4bytes function lookup:", error);
    }
  }

  // Batch lookup all event signatures in a single API call
  if (eventHashes.length > 0) {
    try {
      const hashes = Array.from(seenEventHashes);
      const batchResults = (await fetchEventSignatureFrom4Bytes(hashes)) as Record<string, string[]>;

      // Process results and update ABI items
      for (const { index, hash, item } of eventHashes) {
        const signatures = batchResults[hash] || [];

        if (signatures.length > 0) {
          // Use the first (most common) signature
          const matchedSignature = signatures[0];
          const match = matchedSignature.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);

          // Always update if:
          // 1. We found a match AND it's different from current name, OR
          // 2. Current name is an "Unresolved_*" event (from Heimdall decompilation)
          const isUnresolved = item.name && item.name.startsWith("Unresolved_");
          if (match && match[1] && (match[1] !== item.name || isUnresolved)) {
            // Update event name with better name from 4bytes
            enhancedAbi[index] = {
              ...item,
              name: match[1],
            };
          }
        }
      }
    } catch (error) {
      // If batch lookup fails, keep original ABI items
      console.error("Error in batch 4bytes event lookup:", error);
    }
  }

  return enhancedAbi;
};

export function parseAndCorrectJSON(input: string): any {
  // Add double quotes around keys
  let correctedJSON = input.replace(/(\w+)(?=\s*:)/g, '"$1"');

  // Remove trailing commas
  correctedJSON = correctedJSON.replace(/,(?=\s*[}\]])/g, "");

  try {
    return JSON.parse(correctedJSON);
  } catch (error) {
    console.error("Failed to parse JSON", error);
    throw new Error("Failed to parse JSON");
  }
}

export const getNetworkName = (chains: Chain[], chainId: number) => {
  const chain = chains.find(chain => chain.id === chainId);
  return chain ? chain.name : "Unknown Network";
};
