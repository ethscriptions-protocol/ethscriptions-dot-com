import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { Button } from "~~/components/Button";
import { Heading } from "~~/components/Heading";
import { MarketplaceWithdraw } from "~~/components/MarketplaceWithdraw";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";

const MarketplaceWithdrawPage: NextPage = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  return (
    <>
      <MetaTags
        collection={{
          name: "Withdraw from Marketplace",
          description: "Withdraw escrowed ethscriptions and cancel old listings",
        }}
      />
      <SectionContainer>
        <Section className="gap-6">
          <Heading size="h1">Withdraw from Marketplace</Heading>
          <div className="flex flex-col gap-4 max-w-prose text-base text-gray-700">
            <p>
              The last purchase through the Ethscriptions Marketplace contract was over eight months ago. This
              level of volume does not justify the ongoing work to maintain buying and selling on
              Ethscriptions.com, so we have removed the trading UI from this site.
            </p>
            <p>
              The marketplace contract itself is permissionless and remains live. Trading can continue through
              the contract with a new interface, which anyone can build, or by calling the contract directly.
            </p>
            <p>
              On this page, you can withdraw ethscriptions you previously deposited into the marketplace
              contract, and you can cancel old signed sale listings so they can no longer be filled through the
              contract.
            </p>
            <p>
              There is no time limit, and these actions do not have to happen on this website. If this site is
              unavailable, you can call{" "}
              <code className="font-mono text-sm bg-gray-100 px-1 py-0.5 rounded">withdrawEthscription</code>{" "}
              or{" "}
              <code className="font-mono text-sm bg-gray-100 px-1 py-0.5 rounded">cancelAllListingsOfUser</code>{" "}
              directly on the{" "}
              <a
                href="https://etherscan.io/address/0xd729a94d6366a4feac4a6869c8b3573cee4701a9#writeProxyContract"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-black"
              >
                marketplace contract on Etherscan
              </a>
              .
            </p>
          </div>
          {isConnected && address && isAddress(address) ? (
            <MarketplaceWithdraw address={address} />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-gray-600">Connect your wallet to continue.</p>
              <Button onClick={() => openConnectModal?.()}>Connect Wallet</Button>
            </div>
          )}
        </Section>
      </SectionContainer>
    </>
  );
};

export default MarketplaceWithdrawPage;
