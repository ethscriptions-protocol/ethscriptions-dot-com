import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { normalize } from "viem/ens";
import Blockies from "react-blockies";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useEnsAvatar, useEnsName } from "wagmi";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { KNOWN_ADDRESS_LABELS } from "~~/utils/marketplace";
import { getBlockExplorerAddressLink, getTargetNetwork } from "~~/utils/networks";

type TAddressProps = {
  address?: string;
  disableAddressLink?: boolean;
  noAvatar?: boolean;
  noCopy?: boolean;
  format?: "short" | "long";
};

export const Address = ({ address, disableAddressLink, format, noAvatar, noCopy }: TAddressProps) => {
  const [ens, setEns] = useState<string | null>();
  const [ensAvatar, setEnsAvatar] = useState<string | null>();
  const [addressCopied, setAddressCopied] = useState(false);

  const knownLabel = address ? KNOWN_ADDRESS_LABELS[address.toLowerCase()] : undefined;

  const { data: fetchedEns } = useEnsName({
    address: address as `0x${string}`,
    chainId: 1,
    query: { enabled: !knownLabel && isAddress(address ?? ""), gcTime: 30_000 },
  });

  const normalizedEns = useMemo(() => {
    if (!fetchedEns) return undefined;
    try {
      return normalize(fetchedEns);
    } catch {
      return undefined;
    }
  }, [fetchedEns]);

  const { data: fetchedEnsAvatar } = useEnsAvatar({
    name: normalizedEns,
    chainId: 1,
    query: { enabled: !!normalizedEns, gcTime: 30_000 },
  });

  useEffect(() => {
    setEns(fetchedEns);
  }, [fetchedEns]);

  useEffect(() => {
    setEnsAvatar(fetchedEnsAvatar);
  }, [fetchedEnsAvatar]);

  if (!address) {
    return (
      <div className="animate-pulse flex space-x-4">
        <div className="rounded-md bg-slate-300 h-6 w-6"></div>
        <div className="flex items-center space-y-6">
          <div className="h-2 w-28 bg-slate-300 rounded"></div>
        </div>
      </div>
    );
  }

  if (!isAddress(address)) {
    return <span className="text-error">Wrong address</span>;
  }

  const blockExplorerAddressLink = getBlockExplorerAddressLink(getTargetNetwork(), address);
  let displayAddress = address?.slice(0, 5) + "..." + address?.slice(-4);

  if (knownLabel) {
    displayAddress = knownLabel;
  } else if (ens) {
    displayAddress = ens;
  } else if (format === "long") {
    displayAddress = address;
  }

  return (
    <div className="flex items-center gap-1">
      <div className={`flex-shrink-0 ${noAvatar ? "hidden" : ""}`}>
        {ensAvatar ? (
          // eslint-disable-next-line
          <img className="rounded-full" src={ensAvatar} width={24} height={24} alt={`${address} avatar`} />
        ) : (
          <Blockies className="mx-auto rounded-full" size={8} seed={address.toLowerCase()} scale={3} />
        )}
      </div>
      {disableAddressLink ? (
        <span className="text-base">{displayAddress}</span>
      ) : (
        <a className="text-base font-normal" target="_blank" href={blockExplorerAddressLink} rel="noopener noreferrer">
          {displayAddress}
        </a>
      )}
      {addressCopied ? (
        <CheckCircleIcon
          className="ml-1.5 text-xl font-normal text-sky-600 h-5 w-5 cursor-pointer"
          aria-hidden="true"
        />
      ) : (
        !noCopy && (
          <CopyToClipboard
            text={address}
            onCopy={() => {
              setAddressCopied(true);
              setTimeout(() => {
                setAddressCopied(false);
              }, 800);
            }}
          >
            <DocumentDuplicateIcon
              className="ml-1.5 text-xl font-normal text-sky-600 h-5 w-5 cursor-pointer"
              aria-hidden="true"
            />
          </CopyToClipboard>
        )
      )}
    </div>
  );
};
