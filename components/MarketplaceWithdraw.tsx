import { useEffect, useState } from "react";
import { sendTransaction, switchChain, waitForTransactionReceipt } from "@wagmi/core";
import toast from "react-hot-toast";
import { type Hex, encodeFunctionData } from "viem";
import { useChainId } from "wagmi";
import { mainnet } from "wagmi/chains";
import { Button } from "~~/components/Button";
import { EthscriptionItem } from "~~/components/EthscriptionItem";
import { Grid } from "~~/components/Grid";
import { Modal } from "~~/components/Modal";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { Ethscription } from "~~/types/ethscriptions";
import {
  MARKETPLACE_ADDRESS,
  getEscrowedEthscriptions,
  marketplaceAbi,
  pickCancelAllFunctionName,
} from "~~/utils/marketplace";

export const MarketplaceWithdraw = ({ address }: { address: Hex }) => {
  const chainId = useChainId();
  // The marketplace lives on Ethereum mainnet, regardless of chainConfig.targetNetwork.
  const isWrongNetwork = chainId !== mainnet.id;
  const [switching, setSwitching] = useState(false);
  const [escrowed, setEscrowed] = useState<Ethscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [withdrawPendingId, setWithdrawPendingId] = useState<Hex | null>(null);
  const [cancelAllPending, setCancelAllPending] = useState(false);
  const [showCancelAllModal, setShowCancelAllModal] = useState(false);

  const switchToMainnet = async () => {
    setSwitching(true);
    try {
      await switchChain(wagmiConfig, { chainId: mainnet.id });
    } catch (e) {
      console.error("Switch chain failed:", e);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetched(false);
    getEscrowedEthscriptions(address)
      .then(items => {
        if (cancelled) return;
        setEscrowed(items);
        setFetched(true);
      })
      .catch(e => {
        if (cancelled) return;
        console.error("Failed to fetch escrowed items:", e);
        setFetched(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const withdraw = async (id: Hex) => {
    if (isWrongNetwork) return;
    setWithdrawPendingId(id);
    try {
      const data = encodeFunctionData({
        abi: marketplaceAbi,
        functionName: "withdrawEthscription",
        args: [id],
      });
      const txHash = await sendTransaction(wagmiConfig, {
        to: MARKETPLACE_ADDRESS,
        value: 0n,
        data,
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: txHash,
        confirmations: 1,
        pollingInterval: 1_000,
      });
      if (receipt.status === "success") {
        setEscrowed(prev => prev.filter(e => e.transaction_hash.toLowerCase() !== id.toLowerCase()));
        toast.success("Withdrawn");
      } else {
        toast.error("Withdraw failed");
      }
    } catch (e) {
      console.error("Withdraw failed:", e);
      toast.error("Withdraw failed");
    } finally {
      setWithdrawPendingId(null);
    }
  };

  const cancelAll = async () => {
    if (isWrongNetwork) return;
    setCancelAllPending(true);
    try {
      const fn = await pickCancelAllFunctionName(address);
      const data = encodeFunctionData({
        abi: marketplaceAbi,
        functionName: fn,
        args: [],
      });
      const txHash = await sendTransaction(wagmiConfig, {
        to: MARKETPLACE_ADDRESS,
        value: 0n,
        data,
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: txHash,
        confirmations: 1,
        pollingInterval: 1_000,
      });
      if (receipt.status === "success") {
        toast.success("All listings cancelled");
        setShowCancelAllModal(false);
      } else {
        toast.error("Cancel failed");
      }
    } catch (e) {
      console.error("Cancel-all failed:", e);
      toast.error("Cancel failed");
    } finally {
      setCancelAllPending(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 w-full">
        {isWrongNetwork && (
          <div className="flex flex-col gap-2 items-start rounded-md border border-red-500 bg-red-100 text-black text-sm py-2 px-3">
            <span>
              Connected to the wrong network. The marketplace contract is on Ethereum mainnet.
            </span>
            <Button onClick={switchToMainnet} loading={switching}>
              Switch to Mainnet
            </Button>
          </div>
        )}

        {loading && <p>Loading escrowed items…</p>}

        {!loading && fetched && escrowed.length === 0 && (
          <p className="text-gray-500">
            You have no items escrowed. If you previously signed sale listings, you can still cancel them
            below.
          </p>
        )}

        {escrowed.length > 0 && (
          <Grid>
            {escrowed.map(e => {
              const id = e.transaction_hash as Hex;
              return (
                <div key={id} className="flex flex-col gap-2">
                  <EthscriptionItem ethscription={e} />
                  <Button
                    onClick={() => withdraw(id)}
                    loading={withdrawPendingId?.toLowerCase() === id.toLowerCase()}
                    disabled={
                      isWrongNetwork ||
                      (!!withdrawPendingId && withdrawPendingId.toLowerCase() !== id.toLowerCase())
                    }
                  >
                    Withdraw
                  </Button>
                </div>
              );
            })}
          </Grid>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => setShowCancelAllModal(true)}
            disabled={cancelAllPending || isWrongNetwork}
          >
            Cancel Old Sale Listings
          </Button>
        </div>
      </div>

      <Modal
        title="Cancel Old Sale Listings"
        show={showCancelAllModal}
        onClose={() => (cancelAllPending ? undefined : setShowCancelAllModal(false))}
        confirmText="Cancel Listings"
        onConfirm={cancelAll}
        loading={cancelAllPending}
      >
        <p className="text-sm text-gray-700">
          This sends a transaction that prevents old signed sale listings from this wallet from being used. It
          does not move any items.
        </p>
      </Modal>
    </>
  );
};
