import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { sendTransaction, waitForTransactionReceipt } from "@wagmi/core";
import axios from "axios";
import type { NextPage } from "next";
import { type Hex, isAddress } from "viem";
import { useAccount, useChainId } from "wagmi";
import { Button } from "~~/components/Button";
import { Card } from "~~/components/Card";
import { EthscriptionRenderer } from "~~/components/EthscriptionRenderer";
import { Heading } from "~~/components/Heading";
import { List } from "~~/components/List";
import MetaTags from "~~/components/MetaTags";
import { Modal } from "~~/components/Modal";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import { Table } from "~~/components/Table";
import { AddressInput } from "~~/components/wallet";
import { Address } from "~~/components/wallet/Address";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { Ethscription, Transfer } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";
import { isMarketplaceAddress } from "~~/utils/marketplace";
import { formatTimestamp } from "~~/utils/formatter";
import { getTargetNetwork } from "~~/utils/networks";

const MIN_CONFIRMATIONS = 5;
const MAX_BLOCKS_BEHIND = 2;

function etherscanLink(hash: string) {
  const baseURI =
    process.env.NEXT_PUBLIC_NETWORK == "goerli" ? "https://goerli.etherscan.io/tx" :
    process.env.NEXT_PUBLIC_NETWORK == "sepolia" ? "https://sepolia.etherscan.io/tx" : "https://etherscan.io/tx";
  return `${baseURI}/${hash}`;
}

const configuredNetwork = getTargetNetwork();

const EthscriptionPage: NextPage = () => {
  const [lastImportedBlock, setLastImportedBlock] = useState(0);
  const [blocksBehind, setBlocksBehind] = useState(0);
  const [refresh, setRefresh] = useState(1);
  const [ethscription, setEthscription] = useState<Ethscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { address, isDisconnected } = useAccount();
  const chainId = useChainId();
  const hash = useMemo(() => router.query.hash, [router.query.hash]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferTargetAddress, setTransferTargetAddress] = useState("");
  const transfers = useMemo<Transfer[]>(
    () =>
      [...(ethscription?.ethscription_transfers ?? [])].sort((a, b) => {
        const bn = Number(b.block_number) - Number(a.block_number);
        if (bn !== 0) return bn;
        const txi = Number(b.transaction_index) - Number(a.transaction_index);
        if (txi !== 0) return txi;
        return Number(b.transfer_index) - Number(a.transfer_index);
      }),
    [ethscription?.ethscription_transfers],
  );
  const lastTransferBlockNumber = transfers[0]?.block_number ? parseInt(transfers[0].block_number) : 0;
  const lastTransferConfirmations = useMemo(
    () =>
      lastTransferBlockNumber && lastImportedBlock && lastImportedBlock - lastTransferBlockNumber > 0
        ? lastImportedBlock - lastTransferBlockNumber
        : 0,
    [lastImportedBlock, lastTransferBlockNumber],
  );
  const isIndexerBehind = blocksBehind > MAX_BLOCKS_BEHIND;
  const isWrongNetwork = useMemo(() => chainId !== configuredNetwork.id, [chainId]);
  const isLocked = useMemo(
    () => isIndexerBehind || lastTransferConfirmations < MIN_CONFIRMATIONS || isWrongNetwork,
    [isIndexerBehind, lastTransferConfirmations, isWrongNetwork],
  );
  const { openConnectModal } = useConnectModal();
  const isCurrentOwner = useMemo(
    () =>
      !isDisconnected &&
      !!address &&
      !!ethscription?.current_owner &&
      `${address}`.toLowerCase() === `${ethscription?.current_owner}`.toLowerCase(),
    [isDisconnected, address, ethscription?.current_owner],
  );
  const canWithdrawFromMarketplace = useMemo(
    () =>
      !isDisconnected &&
      !!address &&
      isMarketplaceAddress(ethscription?.current_owner) &&
      !!ethscription?.previous_owner &&
      ethscription.previous_owner.toLowerCase() === address.toLowerCase(),
    [isDisconnected, address, ethscription?.current_owner, ethscription?.previous_owner],
  );

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await axios.get(v2("status"));
        setLastImportedBlock(response.data.last_imported_block);
        setBlocksBehind(response.data.blocks_behind);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 12_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (hash && refresh) {
      setError(null);
      const fetchData = async () => {
        try {
          const response = await axios.get(v2(`ethscriptions/${hash}`));
          setEthscription(response.data.result);
        } catch (e) {
          console.log(e);
          setError("Could not find Ethscription.");
        }
      };
      fetchData();
    }
  }, [hash, refresh]);

  const transferEthscription = async () => {
    if (!ethscription?.transaction_hash || !transferTargetAddress || isLocked) return;
    if (!isAddress(transferTargetAddress)) return;
    if (!address || isDisconnected) {
      openConnectModal?.();
      return;
    }

    try {
      const txHash = await sendTransaction(wagmiConfig, {
        to: transferTargetAddress,
        value: 0n,
        data: ethscription.transaction_hash as Hex,
      });

      setTransferLoading(true);

      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: txHash,
        confirmations: 1,
        pollingInterval: 1_000,
      });
      if (receipt.status === "success") {
        setTransferSuccess(true);
      }
      setTransferLoading(false);
      setRefresh(count => (count += 1));
    } catch (e) {
      console.log(e);
      setTransferLoading(false);
    }
  };

  if (error) {
    return (
      <>
        <MetaTags
          collection={{
            name: "Error",
            description: "Error",
          }}
        />

        <div className="flex flex-col gap-2 px-4 md:px-8 mx-auto mt-8 items-center mb-12">
          <div className="text-2xl">{error}</div>
        </div>
      </>
    );
  }

  if (!ethscription) {
    return null;
  }

  return (
    <>
      <MetaTags
        collection={{
          name: "Ethscriptions",
          description: "Ethscriptions",
        }}
      />
      <SectionContainer>
        <Section>
          <Card>
            <div className="w-full flex flex-col sm:flex-row gap-8">
              <div className="flex flex-1 flex-col items-start justify-start tracking-tight w-full h-full border border-gray-300 rounded-xl overflow-hidden">
                <EthscriptionRenderer
                  hash={ethscription.transaction_hash}
                  contentURI={ethscription.content_uri}
                  mimetype={ethscription.mimetype}
                  attachmentPath={ethscription.attachment_path}
                />
              </div>
              <div className="flex flex-1 flex-col gap-4">
                {lastTransferConfirmations < MIN_CONFIRMATIONS && !isWrongNetwork && (
                  <div
                    className="badge rounded-md border border-red-500 bg-red-100 text-black text-xs
          font-medium text-start text-wrap py-1.5 px-3 h-auto"
                  >
                    Locked for {MIN_CONFIRMATIONS - lastTransferConfirmations} block
                    {MIN_CONFIRMATIONS - lastTransferConfirmations === 1 ? "" : "s"}
                  </div>
                )}
                {isIndexerBehind && !isWrongNetwork && (
                  <div
                    className="badge rounded-md border border-red-500 bg-red-100 text-black text-xs
          font-medium text-start text-wrap py-1.5 px-3 h-auto"
                  >
                    Locked until indexer catches up
                  </div>
                )}
                {isWrongNetwork && (
                  <div
                    className="badge rounded-md border border-red-500 bg-red-100 text-black text-xs
          font-medium text-start text-wrap py-1.5 px-3 h-auto"
                  >
                    Connected to the wrong network
                  </div>
                )}
                <Heading size="h2">
                  {`Ethscription ${
                    !!ethscription.ethscription_number ? ` #${ethscription.ethscription_number}` : ""
                  }`}
                </Heading>
                {isCurrentOwner && (
                  <div className="flex flex-col gap-2 mt-2">
                    <Button onClick={() => setShowTransferModal(true)} disabled={isLocked} loading={transferLoading}>
                      Transfer
                    </Button>
                  </div>
                )}
                {canWithdrawFromMarketplace && (
                  <div className="flex flex-col gap-2 mt-2">
                    <Link
                      href="/marketplace-withdraw"
                      className="btn btn-sm w-fit justify-center rounded-md text-sm font-semibold shadow-sm"
                    >
                      Withdraw from Marketplace →
                    </Link>
                  </div>
                )}
                <List
                  items={[
                    {
                      label: "Mimetype",
                      value: <div className="text-base truncate">{ethscription?.mimetype}</div>,
                      hidden: !ethscription?.mimetype,
                    },
                    {
                      label: "Ethscription #",
                      value: <div className="text-base">{ethscription?.ethscription_number}</div>,
                      hidden: !ethscription?.ethscription_number,
                    },
                    {
                      label: "Owner",
                      value: (
                        <Link
                          href={`/${ethscription.current_owner}`}
                          className="text-gray-500 hover:text-black transition-colors text-base"
                        >
                          <Address address={ethscription.current_owner} disableAddressLink noAvatar noCopy />
                        </Link>
                      ),
                    },
                    {
                      label: "Creator",
                      value: (
                        <Link
                          href={`/${ethscription.creator}`}
                          className="text-gray-500 hover:text-black transition-colors text-base"
                        >
                          <Address address={ethscription.creator} disableAddressLink noAvatar noCopy />
                        </Link>
                      ),
                    },
                    {
                      label: "Created",
                      value: (
                        <Link
                          target="_blank"
                          href={etherscanLink(ethscription.transaction_hash)}
                          onClick={e => e.stopPropagation()}
                          className="text-gray-500 hover:text-black transition-colors text-base"
                        >
                          {formatTimestamp(new Date(parseInt(ethscription.block_timestamp) * 1000).toISOString())}
                        </Link>
                      ),
                    },
                    {
                      label: "Has Attachment (Blob)?",
                      value: (
                        <Link
                          target="_blank"
                          href={etherscanLink(ethscription.transaction_hash)}
                          onClick={e => e.stopPropagation()}
                          className="text-gray-500 hover:text-black transition-colors text-base"
                        >
                          {!!ethscription.attachment_path ? "Yes" : "No"}
                        </Link>
                      ),
                    },
                    {
                      label: "Attachment Content Type",
                      value: ethscription.attachment_content_type || "N/A",
                    },
                  ]}
                />
              </div>
            </div>
          </Card>
        </Section>
        <Section>
          <Card className="gap-4">
            <Heading size="h2">Activity</Heading>
            <div className="flex flex-col">
              <Table
                headers={["Event", "From", "To", "Date"]}
                rows={transfers.map((transfer, index) => {
                  const iso = new Date(parseInt(transfer.block_timestamp) * 1000).toISOString();
                  const formatted = formatTimestamp(iso);
                  return [
                    <div key={transfer.transaction_hash} className="text-base">
                      {index !== transfers.length - 1 ? "Transfer" : "Create"}
                    </div>,
                    <Link
                      key={transfer.transaction_hash}
                      href={`/${transfer.from_address}`}
                      className="text-gray-500 hover:text-black transition-colors text-base"
                    >
                      <Address disableAddressLink={true} noAvatar={true} noCopy={true} address={transfer.from_address} />
                    </Link>,
                    <Link
                      key={transfer.transaction_hash}
                      href={`/${transfer.to_address}`}
                      className="text-gray-500 hover:text-black transition-colors text-base"
                    >
                      <Address disableAddressLink={true} noAvatar={true} noCopy={true} address={transfer.to_address} />
                    </Link>,
                    formatted ? (
                      <Link
                        key={transfer.transaction_hash}
                        href={etherscanLink(transfer.transaction_hash)}
                        target="_blank"
                        className="text-gray-500 hover:text-black transition-colors text-base"
                      >
                        {formatted}
                      </Link>
                    ) : (
                      ""
                    ),
                  ];
                })}
              />
            </div>
          </Card>
        </Section>
      </SectionContainer>
      <Modal
        title="Transfer Ethscription"
        show={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        confirmText="Send Now"
        onConfirm={!transferSuccess ? transferEthscription : undefined}
        loading={transferLoading}
      >
        {transferSuccess ? (
          "Transfer Success"
        ) : (
          <AddressInput
            value={transferTargetAddress}
            placeholder="Enter address or ENS"
            onChange={value => {
              setTransferTargetAddress(value);
            }}
          />
        )}
      </Modal>
    </>
  );
};

export default EthscriptionPage;
