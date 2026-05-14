import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { normalize } from "viem/ens";
import Blockies from "react-blockies";
import { useEnsAddress, useEnsAvatar, useEnsName } from "wagmi";
import { CommonInputProps, InputBase } from "~~/components/wallet";

const isENS = (address = "") => address.endsWith(".eth") || address.endsWith(".xyz");

export const AddressInput = ({ value, name, placeholder, onChange }: CommonInputProps) => {
  const normalizedEnsName = useMemo(() => {
    if (!isENS(value)) return undefined;
    try {
      return normalize(value);
    } catch {
      return undefined;
    }
  }, [value]);

  const { data: ensAddress, isLoading: isEnsAddressLoading } = useEnsAddress({
    name: normalizedEnsName,
    chainId: 1,
    query: { enabled: !!normalizedEnsName, gcTime: 30_000 },
  });

  const [enteredEnsName, setEnteredEnsName] = useState<string>();
  const { data: ensName, isLoading: isEnsNameLoading } = useEnsName({
    address: value as `0x${string}`,
    chainId: 1,
    query: { enabled: isAddress(value), gcTime: 30_000 },
  });

  const normalizedReverseEns = useMemo(() => {
    if (!ensName) return undefined;
    try {
      return normalize(ensName);
    } catch {
      return undefined;
    }
  }, [ensName]);

  const { data: ensAvatar } = useEnsAvatar({
    name: normalizedReverseEns,
    chainId: 1,
    query: { enabled: !!normalizedReverseEns, gcTime: 30_000 },
  });

  useEffect(() => {
    if (!ensAddress) return;
    setEnteredEnsName(value);
    onChange(ensAddress);
  }, [ensAddress, onChange, value]);

  const handleChange = useCallback(
    (newValue: string) => {
      setEnteredEnsName(undefined);
      onChange(newValue);
    },
    [onChange],
  );

  return (
    <InputBase
      name={name}
      placeholder={placeholder}
      error={ensAddress === null}
      value={value}
      onChange={handleChange}
      disabled={isEnsAddressLoading || isEnsNameLoading}
      prefix={
        ensName && (
          <div className="flex bg-gray-300 items-center">
            {ensAvatar ? (
              <span className="w-[28px]">
                {
                  // eslint-disable-next-line
                  <img className="w-full rounded-full" src={ensAvatar} alt={`${ensAddress} avatar`} />
                }
              </span>
            ) : null}
            <span className="text-gray-600 px-2">{enteredEnsName ?? ensName}</span>
          </div>
        )
      }
      suffix={
        value && <Blockies className="!rounded-full m-1" seed={value?.toLowerCase() as string} size={7} scale={4} />
      }
    />
  );
};
