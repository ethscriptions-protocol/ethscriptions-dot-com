import { Button } from "../Button";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BiWalletAlt } from "react-icons/bi";
import { useDisconnect, useSwitchChain } from "wagmi";
import { ArrowLeftOnRectangleIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/solid";
import { BlockieAvatar } from "~~/components/wallet";
import { useNetworkColor } from "~~/hooks/useNetworkColor";
import { getTargetNetwork } from "~~/utils/networks";

export const RainbowKitCustomConnectButton = () => {
  const networkColor = useNetworkColor();
  const configuredNetwork = getTargetNetwork();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        return (
          <>
            {(() => {
              if (!connected) {
                return <BiWalletAlt onClick={openConnectModal} className="cursor-pointer" size={24} />;
              }

              if (chain.id !== configuredNetwork.id) {
                return (
                  <div className="dropdown dropdown-end">
                    <Button tabIndex={0} className="btn-error btn-sm dropdown-toggle">
                      <span>Wrong network</span>
                    </Button>
                    <ul tabIndex={0} className="dropdown-content menu p-2 mt-1 shadow-lg bg-base-100 rounded-lg">
                      <li>
                        <button
                          className="menu-item"
                          type="button"
                          onClick={() => switchChain({ chainId: configuredNetwork.id })}
                        >
                          <ArrowsRightLeftIcon className="h-6 w-4 ml-2 sm:ml-0" />
                          <span className="whitespace-nowrap">
                            Switch to <span style={{ color: networkColor }}>{configuredNetwork.name}</span>
                          </span>
                        </button>
                      </li>
                      <li>
                        <button className="menu-item text-error" type="button" onClick={() => disconnect()}>
                          <ArrowLeftOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" /> <span>Disconnect</span>
                        </button>
                      </li>
                    </ul>
                  </div>
                );
              }

              return (
                <div className="flex justify-end items-center text-white">
                  <div className="flex justify-center items-center border-1 rounded-md">
                    <div className="cursor-pointer" onClick={openAccountModal}>
                      <BlockieAvatar address={account.address} size={24} ensImage={account.ensAvatar} />
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};
