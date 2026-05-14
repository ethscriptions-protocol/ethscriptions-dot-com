import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import type { NextPage } from "next";
import ImageUploading from "react-images-uploading";
import { type Address, formatEther, formatGwei, fromHex, isAddress, toHex } from "viem";
import {
  useAccount,
  useEstimateGas,
  useGasPrice,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { EthscriptionItem } from "~~/components/EthscriptionItem";
import { EthscriptionRenderer } from "~~/components/EthscriptionRenderer";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import { useNativeCurrencyPrice } from "~~/hooks/useNativeCurrencyPrice";
import { v2 } from "~~/utils/escUrl";
import { parseDataURI } from "~~/utils/parsers";

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

const CreatePage: NextPage = () => {
  const { address } = useAccount();
  const [newEthscriptionBase64, setNewEthscriptionBase64] = useState("");
  const [ethscriptionSuccess, setEthscriptionSuccess] = useState(false);
  const [error, setError] = useState<string | null>();
  const [toAddress] = useState("");

  const [alreadyEthscribed, setAlreadyEthscribed] = useState(null);

  const EthscriptionInfo = {
    name: "Create Ethscription",
    description: `Create Ethscription`,
  };

  const ethPrice = useNativeCurrencyPrice();

  const onImageChange = async imageList => {
    setError(null);
    setAlreadyEthscribed(null);
    setNewEthscriptionBase64("");

    if (imageList.length) {
      const hash = await sha256(imageList[0].dataURL);
      const response = await axios.get(v2(`ethscriptions/exists/0x${hash}`));
      const { exists, ethscription } = response.data.result ?? {};
      if (exists) {
        setError("This content has already been ethscribed");
        setAlreadyEthscribed(ethscription);
      } else {
        setNewEthscriptionBase64(imageList[0].dataURL);
      }
    } else {
      setNewEthscriptionBase64("");
    }
  };

  const recipient = useMemo<Address | undefined>(() => {
    if (toAddress && isAddress(toAddress)) return toAddress;
    return address;
  }, [toAddress, address]);

  const dataHex = useMemo(
    () => (newEthscriptionBase64 ? toHex(newEthscriptionBase64) : undefined),
    [newEthscriptionBase64],
  );

  const { data: gasEstimate } = useEstimateGas({
    to: recipient,
    value: 0n,
    data: dataHex,
    query: { enabled: Boolean(recipient && dataHex) },
  });

  const { data: gasPrice } = useGasPrice();

  const approximateCostUsd = useMemo(() => {
    if (!gasEstimate || !gasPrice || !ethPrice) return null;
    const wei = BigInt(gasEstimate) * BigInt(gasPrice);
    return parseFloat(formatEther(wei)) * ethPrice;
  }, [gasEstimate, gasPrice, ethPrice]);

  const { data: txHash, sendTransaction, isPending: isSending } = useSendTransaction();
  const wait = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (wait.isSuccess) setEthscriptionSuccess(true);
  }, [wait.isSuccess]);

  async function ethscribe() {
    if (!recipient || !dataHex) return;
    try {
      const parsedUri = parseDataURI(newEthscriptionBase64);
      if (newEthscriptionBase64.startsWith("data:") && parsedUri.data && parsedUri.mimetype) {
        sendTransaction({ to: recipient, value: 0n, data: dataHex });
      }
    } catch (e) {
      console.log(e);
    }
  }

  const loading = wait.isLoading || isSending;

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />
      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h1" className="mx-auto">
            Create Ethscription
          </Heading>
          <div className="mx-auto">
            Ethscriptions supports all content, but this tool only supports images, for now.
          </div>
          {ethscriptionSuccess && (
            <div className="text-2xl mx-auto lg:max-w-7xl items-center justify-center gap-8 pb-48">
              Check out the new Ethscription on your{" "}
              <a className="underline" href={`/${address}`}>
                profile page
              </a>
              !
            </div>
          )}

          {!address && !ethscriptionSuccess && (
            <div className="mx-auto lg:max-w-7xl flex flex-col items-center justify-center gap-8 pb-48">
              Connect Wallet To Ethscribe
            </div>
          )}

          {address && !ethscriptionSuccess && (
            <div className="w-full px-4 max-w-screen-sm mx-auto flex flex-col items-center justify-center gap-8 pb-48">
              <ImageUploading
                value={[]}
                maxFileSize={96_000}
                acceptType={["png", "gif", "jpg", "jpeg", "svg"]}
                onChange={onImageChange}
                maxNumber={1}
                dataURLKey="dataURL"
              >
                {({ onImageUpload }) => (
                  <div className="flex gap-1">
                    <button className="btn btn-sm rounded-none" type="button" onClick={onImageUpload}>
                      {newEthscriptionBase64 ? "Change Image" : "Upload Image (max 96KB)"}
                    </button>
                  </div>
                )}
              </ImageUploading>

              {!!error && (
                <div className="text-xl mx-auto lg:max-w-7xl items-center justify-center gap-8 pb-48">
                  <div
                    className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
                    role="alert"
                  >
                    <strong className="font-bold">{error}</strong>
                  </div>

                  {!!alreadyEthscribed && <EthscriptionItem ethscription={alreadyEthscribed} />}
                </div>
              )}

              {newEthscriptionBase64 && (
                <button disabled={loading} onClick={ethscribe} className="btn btn-primary btn-sm rounded-none">
                  {loading ? "Loading..." : "Ethscribe!"}
                </button>
              )}

              {newEthscriptionBase64 && (
                <div className="text-sm font-mono">
                  <div>
                    Ethscription size: {fromHex(toHex(newEthscriptionBase64), "bytes").length.toLocaleString()} bytes
                  </div>
                  {!!gasPrice && (
                    <div>
                      Gas Price: {parseFloat(formatGwei(gasPrice)).toFixed(0)} gwei
                    </div>
                  )}
                  {approximateCostUsd !== null && (
                    <div>
                      Approximate cost: ${approximateCostUsd.toFixed(0)}
                    </div>
                  )}
                </div>
              )}

              {!!newEthscriptionBase64 && newEthscriptionBase64.startsWith("data:image") && (
                <div className="w-full">
                  <EthscriptionRenderer contentURI={newEthscriptionBase64} />
                </div>
              )}
            </div>
          )}
        </Section>
      </SectionContainer>
    </>
  );
};

export default CreatePage;
