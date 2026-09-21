import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import type { GetStaticPaths, GetStaticProps, NextPage } from "next";
import { Card } from "~~/components/Card";
import { CollectionAttributes } from "~~/components/CollectionAttributes";
import { EthscriptionRenderer } from "~~/components/EthscriptionRenderer";
import { Heading } from "~~/components/Heading";
import { List } from "~~/components/List";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import { Address } from "~~/components/wallet/Address";
import type { CollectionTokenPageData } from "~~/lib/collections";
import { ethscriptionsByHashParams } from "~~/lib/fetchEthscriptions";
import { Ethscription } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps<CollectionTokenPageData> = async ({ params }) => {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const tokenId = typeof params?.tokenId === "string" ? params.tokenId : "";
  const { loadCollectionToken } = await import("../../../lib/loadCollections");
  const page = loadCollectionToken(slug, tokenId);
  if (!page) return { notFound: true };
  return { props: page, revalidate: 60 };
};

const CollectionTokenPage: NextPage<CollectionTokenPageData> = ({ name, slug, image, symbol, type, item }) => {
  const [ethscription, setEthscription] = useState<Ethscription | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await axios.get(v2("ethscriptions"), {
          params: ethscriptionsByHashParams([item.id]),
        });
        const found = (response.data.result ?? []) as Ethscription[];
        if (!cancelled) setEthscription(found[0] ?? null);
      } catch {
        if (!cancelled) setEthscription(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const title = item.n || `${name} #${item.i}`;

  return (
    <>
      <MetaTags collection={{ name: title, description: `${title} in ${name}` }} />
      <SectionContainer>
        <Section>
          <Card>
            <div className="w-full flex flex-col sm:flex-row gap-8">
              <div className="flex flex-1 flex-col items-start justify-start tracking-tight w-full h-full border border-gray-300 rounded-xl overflow-hidden">
                {ethscription ? (
                  <EthscriptionRenderer
                    hash={ethscription.transaction_hash}
                    contentURI={ethscription.content_uri}
                    mimetype={ethscription.mimetype}
                    attachmentPath={ethscription.attachment_path}
                  />
                ) : (
                  <div className="aspect-square w-full bg-gray-100" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex items-center gap-3">
                  {image && (
                    <Link href={`/collections/${slug}`} className="w-10 h-10 rounded overflow-hidden bg-gray-100 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
                    </Link>
                  )}
                  <Link href={`/collections/${slug}`} className="text-base text-gray-600 hover:text-black underline">
                    {name}
                    {symbol ? ` (${symbol})` : ""}
                    {type ? ` · ${type}` : ""}
                  </Link>
                </div>
                <Heading size="h2">{title}</Heading>
                <List
                  items={[
                    {
                      label: "Token ID",
                      value: <div className="text-base">{item.i}</div>,
                    },
                    {
                      label: "Owner",
                      hidden: !ethscription?.current_owner,
                      value: ethscription?.current_owner && (
                        <Link href={`/${ethscription.current_owner}`} className="text-gray-500 hover:text-black">
                          <Address address={ethscription.current_owner} disableAddressLink noAvatar noCopy />
                        </Link>
                      ),
                    },
                    {
                      label: "Creator",
                      hidden: !ethscription?.creator,
                      value: ethscription?.creator && (
                        <Link href={`/${ethscription.creator}`} className="text-gray-500 hover:text-black">
                          <Address address={ethscription.creator} disableAddressLink noAvatar noCopy />
                        </Link>
                      ),
                    },
                    {
                      label: "Ethscription",
                      value: (
                        <Link href={`/ethscriptions/${item.id}`} className="text-base underline hover:text-black">
                          View standalone ethscription
                        </Link>
                      ),
                    },
                  ]}
                />
                {item.a.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Heading size="h5">Attributes</Heading>
                    <CollectionAttributes traits={item.a} />
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Section>
      </SectionContainer>
    </>
  );
};

export default CollectionTokenPage;
