import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Address, isAddress } from "viem";
import { fetchContractDataFromSourcify } from "~~/utils/abi";

type FetchContractAbiParams = {
  contractAddress: string;
  chainId: number;
  disabled?: boolean;
};

const useFetchContractAbi = ({ contractAddress, chainId, disabled = false }: FetchContractAbiParams) => {
  const [implementationAddress, setImplementationAddress] = useState<Address | null>(null);

  const fetchAbi = async () => {
    if (!isAddress(contractAddress)) {
      throw new Error("Invalid contract address");
    }

    const addressToUse: Address = contractAddress;

    // Fetch contract data from Sourcify (handles proxy contracts and includes deployment info)
    const { abi, implementation, deployment } = await fetchContractDataFromSourcify(addressToUse, chainId);

    if (!abi) throw new Error("Got empty or undefined ABI from Sourcify");

    if (implementation && implementation !== "0x0000000000000000000000000000000000000000") {
      setImplementationAddress(implementation);
    }

    return { abi, address: addressToUse, deployment };
  };

  const { data, error, isLoading } = useQuery({
    queryKey: ["contractAbi", { contractAddress, chainId: chainId }],
    queryFn: fetchAbi,
    enabled: !disabled && isAddress(contractAddress) && chainId !== 31337,
    retry: false,
  });

  return {
    contractData: data,
    error,
    isLoading,
    implementationAddress,
    deploymentInfo: data?.deployment,
  };
};

export default useFetchContractAbi;
