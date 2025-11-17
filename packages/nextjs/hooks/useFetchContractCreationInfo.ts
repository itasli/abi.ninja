import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { fetchContractCreationInfoFromSourcify } from "~~/utils/abi";

type ContractCreationInfo = {
  blockNumber: string;
  txHash: string;
};

type UseFetchContractCreationInfoParams = {
  contractAddress: Address;
  chainId: number;
  enabled?: boolean;
};

const useFetchContractCreationInfo = ({
  contractAddress,
  chainId,
  enabled = true,
}: UseFetchContractCreationInfoParams) => {
  const { data, error, isLoading } = useQuery({
    queryKey: ["contractCreationInfo", { contractAddress, chainId }],
    queryFn: async (): Promise<ContractCreationInfo> => {
      return await fetchContractCreationInfoFromSourcify(contractAddress, chainId);
    },
    enabled: enabled && Boolean(contractAddress) && chainId !== 31337,
    retry: false,
  });

  return {
    contractCreationInfo: data,
    error,
    isLoading,
  };
};

export default useFetchContractCreationInfo;
