import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import type { GetStaticPaths, GetStaticProps, NextPage } from "next";
import InfiniteScroll from "react-infinite-scroll-component";
import { EthscriptionItem } from "~~/components/EthscriptionItem";
import { Grid } from "~~/components/Grid";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import type { CollectionPageData } from "~~/lib/collections";
import { chunkHashes, ethscriptionsByHashParams, orderByRequestedHashes } from "~~/lib/fetchEthscriptions";
import { Ethscription } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";

const PAGE_SIZE = 50;

export const getStaticPaths: GetStaticPaths = async () => {
  const { listDownloadedCollections } = await import("../../../lib/loadCollections");
  return {
    paths: listDownloadedCollections().map(c => ({ params: { slug: c.slug } })),
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps<CollectionPageData> = async ({ params }) => {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const { loadCollectionPage } = await import("../../../lib/loadCollections");
  const collection = loadCollectionPage(slug);
  if (!collection) return { notFound: true };
  return { props: collection, revalidate: 60 };
};

type LoadedItem = { ethscription: Ethscription; i: number; n: string | null };

async function fetchEthscriptions(slice: CollectionPageData["items"]): Promise<LoadedItem[]> {
  const loaded: LoadedItem[] = [];
  const hashes = slice.map(it => it.id);
  const byHash = new Map(slice.map(it => [it.id.toLowerCase(), it]));
  let offset = 0;
  for (const group of chunkHashes(hashes)) {
    const response = await axios.get(v2("ethscriptions"), {
      params: ethscriptionsByHashParams(group),
    });
    const found = (response.data.result ?? []) as Ethscription[];
    for (const { item, index } of orderByRequestedHashes(found, group)) {
      const meta = byHash.get(item.transaction_hash.toLowerCase()) ?? slice[offset + index];
      loaded.push({ ethscription: item, i: meta.i, n: meta.n });
    }
    offset += group.length;
  }
  return loaded;
}

const CollectionPage: NextPage<CollectionPageData> = props => {
  return <CollectionBody key={props.slug} {...props} />;
};

function statLine(page: CollectionPageData) {
  const parts: string[] = [];
  if (page.type) parts.push(page.type);
  parts.push(`${page.supply.toLocaleString()} item${page.supply === 1 ? "" : "s"}`);
  if (page.holders != null) parts.push(`${page.holders.toLocaleString()} holders`);
  if (page.transfers != null) parts.push(`${page.transfers.toLocaleString()} transfers`);
  return parts.join(" · ");
}

const CollectionBody = (page: CollectionPageData) => {
  const { name, image, slug, description, items, twitter, website, discord } = page;
  const [loaded, setLoaded] = useState<LoadedItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const inFlight = useRef(false);
  const offsetRef = useRef(0);

  const hasMore = offset < items.length;

  const fetchMore = useCallback(async () => {
    if (inFlight.current) return;
    const start = offsetRef.current;
    if (start >= items.length) return;
    inFlight.current = true;
    const slice = items.slice(start, start + PAGE_SIZE);
    try {
      const next = await fetchEthscriptions(slice);
      offsetRef.current = start + slice.length;
      setOffset(offsetRef.current);
      setLoaded(prev => [...prev, ...next]);
    } catch (err) {
      console.warn("Failed to load collection items:", err);
    } finally {
      setInitialFetchDone(true);
      inFlight.current = false;
    }
  }, [items]);

  useEffect(() => {
    if (initialFetchDone) return;
    fetchMore();
  }, [initialFetchDone, fetchMore]);

  return (
    <>
      <MetaTags collection={{ name, description: description || `${name} ethscriptions` }} />

      <SectionContainer>
        <Section className="gap-8">
          <div className="flex items-start gap-4">
            {image && (
              <div className="w-16 h-16 rounded overflow-hidden bg-gray-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Heading size="h2">
                {name}
                {page.symbol ? ` (${page.symbol})` : ""}
              </Heading>
              <p className="text-base text-gray-600">{statLine(page)}</p>
              {description && <p className="text-base text-gray-700 max-w-3xl">{description}</p>}
              <p className="text-base text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/collections" className="underline hover:text-black">
                  All collections
                </Link>
                {twitter && (
                  <a href={twitter} target="_blank" rel="noreferrer" className="underline hover:text-black">
                    Twitter
                  </a>
                )}
                {discord && (
                  <a href={discord} target="_blank" rel="noreferrer" className="underline hover:text-black">
                    Discord
                  </a>
                )}
                {website && (
                  <a href={website} target="_blank" rel="noreferrer" className="underline hover:text-black">
                    Website
                  </a>
                )}
              </p>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="text-base text-gray-600">No ethscriptions in this snapshot.</p>
          ) : (
            <InfiniteScroll
              dataLength={loaded.length}
              next={fetchMore}
              hasMore={hasMore}
              loader={<p>Loading...</p>}
              className="!overflow-visible"
            >
              <Grid>
                {loaded.map(item => (
                  <EthscriptionItem
                    key={item.ethscription.transaction_hash}
                    ethscription={item.ethscription}
                    name={item.n || `${name} #${item.i}`}
                    tokenId={item.i}
                    href={`/collections/${slug}/${item.i}`}
                    showOwner
                  />
                ))}
              </Grid>
            </InfiniteScroll>
          )}
        </Section>
      </SectionContainer>
    </>
  );
};

export default CollectionPage;
