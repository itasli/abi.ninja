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
};

const useFetchContractCreationInfo = ({ contractAddress, chainId }: UseFetchContractCreationInfoParams) => {
  const { data, error, isLoading } = useQuery({
    queryKey: ["contractCreationInfo", { contractAddress, chainId }],
    queryFn: async (): Promise<ContractCreationInfo> => {
      return await fetchContractCreationInfoFromSourcify(contractAddress, chainId);
    },
    enabled: Boolean(contractAddress) && chainId !== 31337,
    retry: false,
  });

  return {
    contractCreationInfo: data,
    error,
    isLoading,
  };
};

export default useFetchContractCreationInfo;
