import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getEnsAddress } from "@wagmi/core";
import axios from "axios";
import clsx from "clsx";
import { Dictionary, uniqBy } from "lodash";
import type { NextPage } from "next";
import Blockies from "react-blockies";
import { AiFillTwitterCircle } from "react-icons/ai";
import InfiniteScroll from "react-infinite-scroll-component";
import { isAddress, toHex } from "viem";
import { normalize } from "viem/ens";
import {
  useAccount,
  useEnsAvatar,
  useEnsName,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Button } from "~~/components/Button";
import { EthscriptionItem } from "~~/components/EthscriptionItem";
import { Grid } from "~~/components/Grid";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Modal } from "~~/components/Modal";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { Ethscription } from "~~/types/ethscriptions";
import { escUrl, v2 } from "~~/utils/escUrl";
import { parseDataURI } from "~~/utils/parsers";
import ReactMarkdown from "react-markdown";

const tabClassNames =
  "inline-block p-4 border-b-2 border-transparent rounded-t-lg hover:text-gray-600 hover:border-gray-300";
const tabSelectedClassNames = "inline-block p-4 text-black border-b-2 border-black rounded-t-lg active";

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Profile {
  name?: string;
  description?: string;
  image?: string;
  banner?: string;
  links?: { title: string; url: string }[];
  mode?: "profile" | "collection";
}

const Profile: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [collected, setCollected] = useState<Ethscription[]>([]);
  const [collectedPageKey, setCollectedPageKey] = useState<string | undefined>();
  const [collectedHasMore, setCollectedHasMore] = useState(true);
  const [isLoadingCollected, setIsLoadingCollected] = useState(false);
  const [didFetchCollected, setDidFetchCollected] = useState(false);

  const [created, setCreated] = useState<Ethscription[]>([]);
  const [createdPageKey, setCreatedPageKey] = useState<string | undefined>();
  const [createdHasMore, setCreatedHasMore] = useState(true);
  const [isLoadingCreated, setIsLoadingCreated] = useState(false);
  const [didFetchCreated, setDidFetchCreated] = useState(false);

  const router = useRouter();
  const [address, setAddress] = useState<`0x${string}` | undefined>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState<"collected" | "created">("collected");
  const { data: ens } = useEnsName({
    address,
    chainId: 1,
    query: { enabled: isAddress(address ?? "") },
  });
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [profileSettings, setProfileSettings] = useState<Dictionary<any>>({});

  const normalizedEns = useMemo(() => {
    if (!ens) return undefined;
    try {
      return normalize(ens);
    } catch {
      return undefined;
    }
  }, [ens]);

  const { data: ensAvatar } = useEnsAvatar({
    name: normalizedEns,
    chainId: 1,
    query: { enabled: !!normalizedEns, gcTime: 30_000 },
  });

  const profileDataHex = useMemo(() => {
    return toHex(
      `data:application/vnd.esc.user.profile+json,${JSON.stringify(profileSettings)}`,
    );
  }, [profileSettings]);

  const {
    data: profileTxHash,
    sendTransaction,
    sendTransactionAsync,
    isPending: isSendingProfile,
  } = useSendTransaction();

  const waitProfile = useWaitForTransactionReceipt({
    hash: profileTxHash,
    confirmations: 1,
    pollingInterval: 1_000,
  });

  useEffect(() => {
    if (waitProfile.isSuccess) setShowEditProfileModal(false);
  }, [waitProfile.isSuccess]);

  useEffect(() => {
    setCollected([]);
    setCollectedPageKey(undefined);
    setCollectedHasMore(true);
    setDidFetchCollected(false);

    setCreated([]);
    setCreatedPageKey(undefined);
    setCreatedHasMore(true);
    setDidFetchCreated(false);
  }, [address]);

  useEffect(() => {
    (async () => {
      if (router.query.address) {
        const queryAddr = `${router.query.address}` as any;
        if (isAddress(queryAddr)) {
          setAddress(queryAddr);
        } else if (queryAddr.toLowerCase().endsWith(".eth")) {
          let normalized: string | undefined;
          try {
            normalized = normalize(queryAddr.toLowerCase());
          } catch {
            normalized = undefined;
          }
          if (normalized) {
            const _address = await getEnsAddress(wagmiConfig, {
              chainId: 1,
              name: normalized,
            });
            if (_address) {
              setAddress(_address);
            }
          }
        } else if (/^[a-z0-9]*$/.test(queryAddr.toLowerCase())) {
          const hash = await sha256(`data:,${queryAddr}`.toLowerCase());
          try {
            const existsRes = await axios.get(v2(`ethscriptions/exists/0x${hash}`));
            const { exists, ethscription } = existsRes.data.result;
            if (exists && ethscription) {
              setAddress(ethscription.current_owner);
            }
          } catch (error) {
            console.error("Error checking ethscription existence:", error);
          }
        }
      }
    })();
  }, [router.query.address]);

  const fetchCollected = useCallback(async () => {
    if (isLoadingCollected || !address) return;
    setIsLoadingCollected(true);
    try {
      const params: any = {
        current_owner: address,
        sort_by: "newest_first",
        max_results: 25,
      };
      if (collectedPageKey) params.page_key = collectedPageKey;

      const collectedRes = await axios.get(v2("ethscriptions"), { params });
      const items = (collectedRes.data.result ?? []) as Ethscription[];
      setCollected(prev => uniqBy([...prev, ...items], "transaction_hash"));
      setCollectedPageKey(collectedRes.data.pagination?.page_key);
      setCollectedHasMore(!!collectedRes.data.pagination?.has_more);
      setDidFetchCollected(true);
    } catch (error) {
      console.error("Error fetching collected ethscriptions:", error);
    } finally {
      setIsLoadingCollected(false);
    }
  }, [isLoadingCollected, address, collectedPageKey]);

  const fetchCreated = useCallback(async () => {
    if (isLoadingCreated || !address) return;
    setIsLoadingCreated(true);
    try {
      const params: any = {
        creator: address,
        sort_by: "newest_first",
        max_results: 25,
      };
      if (createdPageKey) params.page_key = createdPageKey;

      const createdRes = await axios.get(v2("ethscriptions"), { params });
      const items = (createdRes.data.result ?? []) as Ethscription[];
      setCreated(prev => uniqBy([...prev, ...items], "transaction_hash"));
      setCreatedPageKey(createdRes.data.pagination?.page_key);
      setCreatedHasMore(!!createdRes.data.pagination?.has_more);
      setDidFetchCreated(true);
    } catch (error) {
      console.error("Error fetching created ethscriptions:", error);
    } finally {
      setIsLoadingCreated(false);
    }
  }, [isLoadingCreated, address, createdPageKey]);

  useEffect(() => {
    if (address && !didFetchCollected) {
      fetchCollected();
    }
  }, [address, didFetchCollected, fetchCollected]);

  useEffect(() => {
    if (address && !didFetchCreated) {
      fetchCreated();
    }
  }, [address, didFetchCreated, fetchCreated]);

  useEffect(() => {
    if (address && !waitProfile?.isLoading) {
      const fetchProfileData = async () => {
        let _profile: any = {};
        try {
          const profileSettingsRes = await axios.get(v2("ethscriptions"), {
            params: {
              current_owner: "0x0000000000000000000000000000000000000000",
              creator: address,
              mimetype: "application/vnd.esc.user.profile+json",
              max_results: 1,
              sort_by: "newest_first",
            },
          });
          const items = profileSettingsRes.data.result ?? [];
          if (items[0]?.content_uri) {
            const parsedUri = parseDataURI(items[0].content_uri);
            if (parsedUri.data) {
              _profile = JSON.parse(parsedUri.data);
            }
          }
        } catch (e) {
          console.error("Error fetching profile settings:", e);
        }
        setProfile(_profile);
        setProfileSettings(_profile);
      };
      fetchProfileData();
    }
  }, [address, waitProfile?.isLoading]);

  const saveProfileSettings = async () => {
    try {
      await sendTransactionAsync({
        to: "0x0000000000000000000000000000000000000000",
        value: 0n,
        data: profileDataHex,
      });
    } catch (e) {
      console.error("Profile save failed:", e);
    }
  };

  const isOwnProfile = !!connectedAddress && !!address && connectedAddress.toLowerCase() === address.toLowerCase();

  let displayAddress = address
    ? `${address.slice(0, 5)}...${address.slice(-4)}`
    : null;

  if (!address) {
    return null;
  }

  if (ens) {
    displayAddress = ens;
  }

  const EthscriptionInfo = {
    name: displayAddress,
    description: `${displayAddress}'s Ethscriptions`,
  };

  const profileImage = profile?.image ? escUrl(profile.image) : ensAvatar;
  const bannerImage = profile?.banner ? escUrl(profile.banner) : null;

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />

      <SectionContainer>
        <Section>
          <div className="flex flex-col bg-white rounded-2xl shadow-sm overflow-hidden">
            {!!bannerImage && (
              <img
                src={bannerImage}
                alt={`${profile?.name ?? displayAddress} banner`}
                className="aspect-[4/1]"
                style={{
                  imageRendering: "pixelated",
                  width: "100%",
                  objectFit: "cover",
                }}
              />
            )}
            <div className="flex flex-1 flex-col items-start gap-6 p-6 sm:gap-8 sm:p-8">
              <div className="flex flex-1 flex-row w-full gap-6 sm:gap-8">
                <div className="flex-1 flex-shrink-0">
                  {profileImage ? (
                    // eslint-disable-next-line
                    <img
                      className="rounded-full aspect-square"
                      src={profileImage}
                      width={80}
                      height={80}
                      alt={`${profile?.name ?? displayAddress} avatar`}
                      onError={e => {
                        (e.target as HTMLImageElement).style.visibility =
                          "hidden";
                      }}
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <Blockies
                      className="rounded-full"
                      size={8}
                      seed={address.toLowerCase()}
                      scale={10}
                    />
                  )}
                </div>
                <div className="flex gap-4 items-start">
                  {!!profileSettings?.links?.find((l: { title: string; url: string }) => l.title === "Twitter")
                    ?.url && (
                    <Link
                      href={
                        profileSettings?.links?.find((l: { title: string; url: string }) => l.title === "Twitter")
                          ?.url
                      }
                      target="_blank"
                    >
                      <AiFillTwitterCircle size={28} />
                    </Link>
                  )}

                  {connectedAddress?.toLowerCase() === address?.toLowerCase() && (
                    <Button onClick={() => setShowEditProfileModal(true)}>
                      Settings
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Heading size="h2">{profile?.name ?? displayAddress}</Heading>
                {!!profile?.description && (
                  <div>
                    {
                      <ReactMarkdown
                        className="markdown max-w-prose"
                        children={profile.description}
                      />
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>

        <Section>
          <div className="w-full text-md font-medium text-center text-gray-500 border-b border-gray-200 dark:text-gray-400 dark:border-gray-700">
            <ul className="flex flex-wrap -mb-px">
              <li className="mr-2">
                <a
                  href="#"
                  className={clsx(
                    page === "collected" ? tabSelectedClassNames : tabClassNames,
                  )}
                  onClick={e => {
                    e.preventDefault();
                    setPage("collected");
                  }}
                >
                  Collected
                </a>
              </li>
              <li className="mr-2">
                <a
                  href="#"
                  className={clsx(
                    page === "created" ? tabSelectedClassNames : tabClassNames,
                  )}
                  aria-current={page === "created" ? "page" : undefined}
                  onClick={e => {
                    e.preventDefault();
                    setPage("created");
                  }}
                >
                  Created
                </a>
              </li>
              {isOwnProfile && (
                <li className="mr-2">
                  <Link
                    href="/marketplace-withdraw"
                    className={clsx(tabClassNames)}
                  >
                    Withdraw from Marketplace
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </Section>

        {page === "collected" && (
          <>
            {!isLoadingCollected && collected.length === 0 && didFetchCollected && (
              <Section>
                <Heading size="h3">No Ethscriptions Found</Heading>
              </Section>
            )}
            {!!collected.length && (
              <Section className="gap-4">
                <InfiniteScroll
                  dataLength={collected.length}
                  next={fetchCollected}
                  hasMore={collectedHasMore}
                  loader={<p>Loading...</p>}
                  className="!overflow-visible"
                >
                  <Grid>
                    {collected.map(ethscription => (
                      <EthscriptionItem
                        ethscription={ethscription}
                        key={ethscription.transaction_hash}
                      />
                    ))}
                  </Grid>
                </InfiniteScroll>
              </Section>
            )}
            {isLoadingCollected && collected.length === 0 && (
              <Section>Loading...</Section>
            )}
          </>
        )}

        {page === "created" && (
          <>
            {!isLoadingCreated && created.length === 0 && didFetchCreated && (
              <Section>
                <Heading size="h3">No Ethscriptions Found</Heading>
              </Section>
            )}
            {!!created.length && (
              <Section className="gap-4">
                <InfiniteScroll
                  dataLength={created.length}
                  next={fetchCreated}
                  hasMore={createdHasMore}
                  loader={<p>Loading...</p>}
                  className="!overflow-visible"
                >
                  <Grid>
                    {created.map(ethscription => (
                      <EthscriptionItem
                        ethscription={ethscription}
                        key={ethscription.transaction_hash}
                      />
                    ))}
                  </Grid>
                </InfiniteScroll>
              </Section>
            )}
            {isLoadingCreated && created.length === 0 && (
              <Section>Loading...</Section>
            )}
          </>
        )}

      </SectionContainer>

      <Modal
        title="Edit Profile"
        show={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
        confirmText="Save"
        onConfirm={saveProfileSettings}
        loading={waitProfile.isLoading || isSendingProfile}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="profile-name"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Name
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <input
                type="text"
                id="profile-name"
                name="profile-name"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Name"
                onChange={e =>
                  setProfileSettings(settings => ({
                    ...settings,
                    name: e.target.value,
                  }))
                }
                value={profileSettings?.name ?? ""}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Description
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <textarea
                id="description"
                name="description"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Description"
                onChange={e =>
                  setProfileSettings(settings => ({
                    ...settings,
                    description: e.target.value,
                  }))
                }
                value={profileSettings?.description ?? ""}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Profile Image URL
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <input
                type="text"
                id="image"
                name="image"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="https://"
                onChange={e =>
                  setProfileSettings(settings => ({
                    ...settings,
                    image: e.target.value,
                  }))
                }
                value={profileSettings?.image ?? ""}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="banner"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Banner Image URL (1400px x 350px)
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <input
                type="text"
                id="banner"
                name="banner"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="https://"
                onChange={e =>
                  setProfileSettings(settings => ({
                    ...settings,
                    banner: e.target.value,
                  }))
                }
                value={profileSettings?.banner ?? ""}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="twitter-link"
              className="block text-sm font-medium leading-6 text-gray-900"
            >
              Twitter Link
            </label>
            <div className="relative mt-2 rounded-md shadow-sm">
              <input
                type="text"
                id="twitter-link"
                name="twitter-link"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="https://twitter.com/username"
                onChange={e =>
                  setProfileSettings(settings => ({
                    ...settings,
                    links: [
                      ...(settings?.links?.filter((l: { title: string; url: string }) => l.title !== "Twitter") ||
                        []),
                      { title: "Twitter", url: e.target.value },
                    ],
                  }))
                }
                value={
                  profileSettings?.links?.find((l: { title: string; url: string }) => l.title === "Twitter")
                    ?.url ?? ""
                }
              />
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Profile;
