import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import axios from "axios";
import clsx from "clsx";
import { isAddress } from "viem";
import { Dictionary } from "lodash";
import { useAccount, useEnsName } from "wagmi";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/wallet";
import { useOutsideClick } from "~~/hooks/useOutsideClick";
import { endpoints } from "~~/lib/endpoints";
import { v2 } from "~~/utils/escUrl";

const NavLink = ({ href, children, classNames }: { href: string; children: React.ReactNode; classNames?: string }) => {
  const router = useRouter();
  const isActive = router.pathname === href;

  return (
    <Link
      href={href}
      passHref
      className={`${
        isActive ? "underline" : ""
      } bg-transparent hover:underline py-1.5 px-3 text-base rounded-full gap-2 ${classNames}`}
    >
      {children}
    </Link>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Dictionary<any>>({});
  const { address } = useAccount();
  const { data: ens } = useEnsName({
    address,
    chainId: 1,
    query: { enabled: isAddress(address ?? "") },
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(v2("status"));
        setData(response.data);
      } catch (e) {
        console.error(e);
        setData({});
      }
    };
    
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 12_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  const navLinks = (
    <>
      <li>
        <NavLink href="/collections">Collections</NavLink>
      </li>
      <li>
        <Link
          target="_blank"
          href={endpoints.docs}
          passHref
          className="bg-transparent hover:underline py-1.5 px-3 text-base rounded-full gap-2"
        >
          Docs
        </Link>
      </li>
      <li>
        <NavLink href="/create">Create</NavLink>
      </li>
      {!!address && (
        <li>
          <NavLink href={`/${ens ?? address}`}>Profile</NavLink>
        </li>
      )}
      <li>
        <NavLink href="/all">Recent</NavLink>
      </li>
    </>
  );

  return (
    <>
      <div
        className={clsx(
          "justify-center items-center z-20 flex px-1 py-1 text-xs border-b",
          data.current_block_number ? "" : "invisible",
          data.blocks_behind < 5 ? "bg-green-100" : "bg-red-100",
        )}
      >
        <>
          Indexer Status: {data.blocks_behind} block{data.blocks_behind === 1 ? "" : "s"} behind
        </>
      </div>

      <div className="z-20 flex px-4 py-4 border-b justify-center">
        <div className="flex w-full max-w-7xl justify-between">
          <div className="flex-grow flex items-center gap-2">
            <div className="lg:hidden dropdown h-full aspect-square cursor-pointer -ml-2" ref={burgerMenuRef}>
              <div
                className="grid place-items-center"
                onClick={() => {
                  setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
                }}
              >
                <Bars3Icon className="h-2/3" />
              </div>
              {isDrawerOpen && (
                <ul
                  tabIndex={0}
                  style={{ visibility: "visible", opacity: 1 }}
                  className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-base-100 rounded-box w-52 z-[1000]"
                  onClick={() => {
                    setIsDrawerOpen(false);
                  }}
                >
                  {navLinks}
                </ul>
              )}
            </div>
            <Link href="/" passHref className="lg:flex items-center gap-2 shrink-0">
              <div className="flex flex-col h-[30px] relative">
                <img alt="Ethscriptions" className="h-[30px]" src="/assets/logo-lockup.svg" />
                {/* <img alt="Loading" className="absolute h-[30px] left-0" src="/assets/loading-animation.gif" /> */}
              </div>
            </Link>
            <ul className="md:text-xl md:font-medium hidden lg:flex lg:flex-nowrap w-full justify-evenly menu menu-horizontal px-1 gap-2">
              {navLinks}
            </ul>
          </div>
          <div className="flex justify-end items-center">
            <RainbowKitCustomConnectButton />
          </div>
        </div>
      </div>
    </>
  );
};
